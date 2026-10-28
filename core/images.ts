// Pure image logic: validation, cache keys, prompts, quota and budget
// helpers. No env reads, no network, no secrets. Server modules inject
// the KV, store, and generator clients defined here.
import {
  ImageValidationError,
  parseStyleChoice,
  styleDescriptorLine,
  styleSegment,
} from "./image-style";
import type { ImageStyle } from "./image-style";
import { IMAGE_COST_MICRO, PROMPT_VERSION } from "./types";
import type { ImageKind, ImageRequest } from "./types";

export type { ImageErrorCode, ImageKind, ImageRequest, ImageResponse } from "./types";
export { ImageStyleError, ImageValidationError } from "./image-style";
export type { ImageStyle, ImageStylePresetId, StyleChoice } from "./image-style";

export const DAILY_IMAGE_LIMIT = 5;
export const QUOTA_TTL_SEC = 48 * 3600;
export const LOCK_TTL_SEC = 150;
export const MAX_PASSAGE_CHARS = 600;
export const MAX_SCENE_CLIP_CHARS = 1200;

export const MSG_BAD_REQUEST = "That request was not valid. Try again.";
export const MSG_QUOTA = "You reached your limit of 5 images per day. Come back tomorrow.";
export const MSG_BUDGET = "The generation limit was reached. Try again later.";
export const MSG_UNAVAILABLE = "Images are unavailable right now.";
export const MSG_FAILED = "Could not generate the image. Try again.";
export const MSG_RETRY = "The image is taking longer than expected. Try again.";
export const MSG_STYLE = "That style can't be used. Try a different one.";

// Minimal store surface the route needs; Upstash REST and Blob clients
// implement these in server/, tests use the memory fake below.
export interface KV {
  get(key: string): Promise<string | null>;
  setNxEx(key: string, value: string, exSec: number): Promise<boolean>;
  set(key: string, value: string): Promise<void>;
  incr(key: string): Promise<number>;
  incrBy(key: string, by: number): Promise<number>;
  decr(key: string): Promise<number>;
  decrBy(key: string, by: number): Promise<number>;
  expire(key: string, sec: number): Promise<void>;
  releaseIfToken(key: string, token: string): Promise<boolean>;
}

export interface ImageStore {
  findUrl(path: string): Promise<string | null>;
  save(path: string, bytes: Uint8Array): Promise<string>;
}

export interface ImageGenerator {
  generate(prompt: string): Promise<Uint8Array>;
}

function isRecord(json: unknown): json is Record<string, unknown> {
  return typeof json === "object" && json !== null && !Array.isArray(json);
}

// Strict parse at the trust boundary: exact fields only, so a client
// bug cannot silently spend budget on a misread request.
export function parseImageRequest(json: unknown): ImageRequest {
  if (!isRecord(json)) throw new ImageValidationError();
  const { kind } = json;
  if (kind === "passage") {
    const keys = Object.keys(json).sort().join(",");
    if (keys !== "bookId,kind,n,textVersion" && keys !== "bookId,kind,n,style,textVersion") {
      throw new ImageValidationError();
    }
    if (typeof json.bookId !== "string" || json.bookId.length === 0) throw new ImageValidationError();
    if (typeof json.textVersion !== "string" || json.textVersion.length === 0) {
      throw new ImageValidationError();
    }
    if (typeof json.n !== "number" || !Number.isInteger(json.n)) throw new ImageValidationError();
    const style = parseStyleChoice(json.style);
    return {
      kind: "passage",
      bookId: json.bookId,
      textVersion: json.textVersion,
      n: json.n,
      ...(style === undefined ? {} : { style }),
    };
  }
  if (kind === "scene") {
    const keys = Object.keys(json).sort().join(",");
    if (keys !== "bookId,kind,sceneId,textVersion" && keys !== "bookId,kind,sceneId,style,textVersion") {
      throw new ImageValidationError();
    }
    if (typeof json.bookId !== "string" || json.bookId.length === 0) throw new ImageValidationError();
    if (typeof json.textVersion !== "string" || json.textVersion.length === 0) {
      throw new ImageValidationError();
    }
    if (typeof json.sceneId !== "string" || json.sceneId.length === 0) throw new ImageValidationError();
    const style = parseStyleChoice(json.style);
    return {
      kind: "scene",
      bookId: json.bookId,
      textVersion: json.textVersion,
      sceneId: json.sceneId,
      ...(style === undefined ? {} : { style }),
    };
  }
  throw new ImageValidationError();
}

export interface BookRef {
  id: string;
  textVersion: string;
  paragraphNs: Set<number>;
  sceneIds: Set<string>;
}

// Checks the parsed request against the frozen book text.
export function validateAgainstBook(req: ImageRequest, book: BookRef): void {
  if (req.bookId !== book.id) throw new ImageValidationError();
  if (req.textVersion !== book.textVersion) throw new ImageValidationError();
  if (req.kind === "passage") {
    if (!book.paragraphNs.has(req.n)) throw new ImageValidationError();
    return;
  }
  if (!book.sceneIds.has(req.sceneId)) throw new ImageValidationError();
}

// One paragraph maps to one image; one scene maps to one image. A styled
// image keeps the same base with a style segment before the file name, so
// an omitted style keys byte-identically to today.
export function imageKey(req: ImageRequest): string {
  const base = `images/${req.bookId}/${req.textVersion}/${PROMPT_VERSION}`;
  const file = req.kind === "passage" ? `p${req.n}.webp` : `scene-${req.sceneId}.webp`;
  return req.style === undefined ? `${base}/${file}` : `${base}/${styleSegment(req.style)}/${file}`;
}

export function indexKeyFor(key: string): string {
  return `img:index:${key}`;
}

export function lockKeyFor(key: string): string {
  return `img:lock:${key}`;
}

export function quotaKeys(args: { day: string; ipHash: string; anonId: string }): {
  ip: string;
  anon: string;
} {
  return {
    ip: `img:quota:ip:${args.day}:${args.ipHash}`,
    anon: `img:quota:anon:${args.day}:${args.anonId}`,
  };
}

export function spendKey(): string {
  return "img:spend:micro";
}

export function overQuota(count: number): boolean {
  return count > DAILY_IMAGE_LIMIT;
}

export function budgetExceeded(totalAfterReserve: number, capMicro: number): boolean {
  return totalAfterReserve > capMicro;
}

export function imageCostMicro(): number {
  return IMAGE_COST_MICRO;
}

// Lets the route compare lock tokens without touching Redis twice.
export function canRelease(expected: string, actual: string | null): boolean {
  return actual !== null && actual === expected;
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max).trimEnd();
}

// Prompt from trusted server-side book text only. The client sends
// ordinals and ids, never free text, so there is no injection path. Only
// the optional parsed style reaches the prompt, never raw client text.
export function buildPrompt(args: {
  kind: ImageKind;
  passageText: string;
  sceneTitle: string;
  sceneClip: string;
  style?: ImageStyle;
}): string {
  const denslow =
    "Illustration in the style of W. W. Denslow's 1900 first-edition " +
    "illustrations for The Wonderful Wizard of Oz: flat color, bold black " +
    "ink outlines, limited palette. Dorothy wears silver shoes. Nothing " +
    "from the 1939 MGM film, no ruby slippers, no film look. No text, " +
    "no captions, no lettering in the image.";
  const style = args.style === undefined ? denslow : styleDescriptorLine(args.style);
  if (args.kind === "scene") {
    return (
      `Scene "${args.sceneTitle}". ${clip(args.sceneClip, MAX_SCENE_CLIP_CHARS)}. ${style}`
    );
  }
  return (
    `Scene "${args.sceneTitle}". Passage: ${clip(args.passageText, MAX_PASSAGE_CHARS)}. ` +
    `Context: ${clip(args.sceneClip, MAX_SCENE_CLIP_CHARS)}. ${style}`
  );
}

export function buildCaption(args: {
  kind: ImageKind;
  sceneTitle: string;
  passageText: string;
}): string {
  if (args.kind === "scene") return args.sceneTitle;
  const words = args.passageText.replace(/\s+/g, " ").trim().split(" ").slice(0, 10);
  const head = words.join(" ");
  return words.length >= 10 ? `${head}…` : head;
}

// In-memory KV for tests. Expiries are checked against Date.now.
export function createMemoryKV(): KV & { clear(): void } {
  const values = new Map<string, string>();
  const expiresAt = new Map<string, number>();
  function live(key: string): boolean {
    const until = expiresAt.get(key);
    if (until !== undefined && Date.now() >= until) {
      values.delete(key);
      expiresAt.delete(key);
      return false;
    }
    return true;
  }
  function num(key: string): number {
    return Number(values.get(key) ?? "0");
  }
  return {
    async get(key: string): Promise<string | null> {
      if (!live(key)) return null;
      return values.get(key) ?? null;
    },
    async setNxEx(key: string, value: string, exSec: number): Promise<boolean> {
      if (live(key) && values.has(key)) return false;
      values.set(key, value);
      expiresAt.set(key, Date.now() + exSec * 1000);
      return true;
    },
    async set(key: string, value: string): Promise<void> {
      values.set(key, value);
      expiresAt.delete(key);
    },
    async incr(key: string): Promise<number> {
      const next = num(key) + 1;
      values.set(key, String(next));
      return next;
    },
    async incrBy(key: string, by: number): Promise<number> {
      const next = num(key) + by;
      values.set(key, String(next));
      return next;
    },
    async decr(key: string): Promise<number> {
      const next = num(key) - 1;
      values.set(key, String(next));
      return next;
    },
    async decrBy(key: string, by: number): Promise<number> {
      const next = num(key) - by;
      values.set(key, String(next));
      return next;
    },
    async expire(key: string, sec: number): Promise<void> {
      if (values.has(key)) expiresAt.set(key, Date.now() + sec * 1000);
    },
    async releaseIfToken(key: string, token: string): Promise<boolean> {
      if (!live(key)) return false;
      if (values.get(key) !== token) return false;
      values.delete(key);
      expiresAt.delete(key);
      return true;
    },
    clear(): void {
      values.clear();
      expiresAt.clear();
    },
  };
}
