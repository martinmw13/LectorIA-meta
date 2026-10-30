import "server-only";
import { loadBookmap } from "@/server/bookmap";
import type { BookMap, BookmapCharacter } from "@/core/bookmap";

// Bookmap details for image prompts. The values are LLM-derived data, so
// they travel in one delimited section after the passage text and never
// touch the style line. Pure except getBookmap, which caches the loader.

const PASSAGE_CHAR_CAP = 4;
const CHAPTER_CAST_CAP = 6;
const OBJECT_CAP = 3;
const PLACE_CAP = 6;
const BLOCK_CHARS = 900;
const DESC_CHARS = 160;
const COVER_CHARS = 220;

const cache = new Map<string, BookMap | null>();

export function getBookmap(bookId: string, textVersion: string, expectedInput: string, root?: string): BookMap | null {
  const key = `${bookId} ${textVersion} ${expectedInput} ${root ?? ""}`;
  if (!cache.has(key)) {
    cache.set(key, root === undefined ? loadBookmap(bookId, textVersion, expectedInput) : loadBookmap(bookId, textVersion, expectedInput, root));
  }
  return cache.get(key) ?? null;
}

// Clip at a word boundary so a value never ends mid-word.
export function clipWords(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, "");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

// Character ids named in the text, longest alias first so "Wicked Witch
// of the West" wins its span over "Witch", in first-appearance order.
// Capitalized names match case-sensitively, lowercase ones loosely.
export function matchCharacterIds(text: string, characters: BookmapCharacter[]): string[] {
  const spans: { id: string; start: number; end: number }[] = [];
  for (const char of characters) {
    for (const spelling of [char.name, ...char.aliases]) {
      if (!spelling.trim()) continue;
      const flags = /^[A-Z]/.test(spelling) ? "g" : "gi";
      const re = new RegExp(`\\b${escapeRegExp(spelling)}\\b`, flags);
      for (const m of text.matchAll(re)) {
        if (m.index === undefined) continue;
        spans.push({ id: char.id, start: m.index, end: m.index + m[0].length });
      }
    }
  }
  spans.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const claimed: typeof spans = [];
  for (const span of spans) {
    if (claimed.every((c) => span.end <= c.start || span.start >= c.end)) claimed.push(span);
  }
  claimed.sort((a, b) => a.start - b.start);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const span of claimed) {
    if (!seen.has(span.id)) {
      seen.add(span.id);
      out.push(span.id);
    }
  }
  return out;
}

function mentions(text: string, phrase: string): boolean {
  if (!phrase.trim()) return false;
  return new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "i").test(text);
}

// Characters the reader could already have met, with a look to keep.
function knownCast(bookmap: BookMap, ids: string[], ch: number): BookmapCharacter[] {
  const byId = new Map(bookmap.characters.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const out: BookmapCharacter[] = [];
  for (const id of ids) {
    const char = byId.get(id);
    if (!char || seen.has(id)) continue;
    seen.add(id);
    if (char.first_ch === null || char.first_ch > ch) continue;
    if (!oneLine(char.physical_description)) continue;
    out.push(char);
  }
  return out;
}

function charLine(char: BookmapCharacter): string {
  return `${oneLine(char.name)}: ${clipWords(oneLine(char.physical_description), DESC_CHARS)}`;
}

// One sentence-ending period: a clipped value may already end in ".".
function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function block(parts: string[]): string {
  if (parts.length === 0) return "";
  return clipWords(`Reference details: ${parts.join(" ")}`, BLOCK_CHARS);
}

export function passageReference(args: {
  bookmap: BookMap | null;
  sceneIds: string[];
  selectedText: string;
  ch: number;
}): string {
  if (!args.bookmap) return "";
  const bookmap = args.bookmap;
  const scenes = args.sceneIds.map((id) => bookmap.scenes[id]).filter((s) => s !== undefined);
  if (scenes.length === 0) return "";
  const matched = matchCharacterIds(args.selectedText, bookmap.characters);
  const ids = matched.length > 0 ? matched : scenes.flatMap((s) => s.characters_present);
  const cast = knownCast(bookmap, ids, args.ch).slice(0, PASSAGE_CHAR_CAP);
  const parts: string[] = [];
  if (cast.length > 0) {
    parts.push(sentence(`Characters (keep consistent): ${cast.map(charLine).join("; ")}`));
  }
  const first = scenes[0];
  if (first) {
    const setting = [first.setting.location, first.setting.time_of_day, first.setting.weather]
      .map(oneLine)
      .filter((p) => p !== "");
    if (setting.length > 0) parts.push(sentence(`Setting: ${setting.join(", ")}`));
  }
  const world = [bookmap.setting.time_period, bookmap.setting.world].map(oneLine).filter((p) => p !== "");
  if (world.length > 0) parts.push(sentence(`World: ${world.join(", ")}`));
  const seen = new Set<string>();
  const objects: string[] = [];
  for (const scene of scenes) {
    for (const object of scene.key_objects) {
      const clean = oneLine(object);
      if (!clean || seen.has(clean)) continue;
      seen.add(clean);
      if (mentions(args.selectedText, clean)) objects.push(clean);
      if (objects.length >= OBJECT_CAP) break;
    }
    if (objects.length >= OBJECT_CAP) break;
  }
  if (objects.length > 0) parts.push(sentence(`Objects: ${objects.join(", ")}`));
  return block(parts);
}

export function chapterReference(args: { bookmap: BookMap | null; sceneIds: string[]; ch: number }): string {
  if (!args.bookmap) return "";
  const bookmap = args.bookmap;
  const scenes = args.sceneIds.map((id) => bookmap.scenes[id]).filter((s) => s !== undefined);
  if (scenes.length === 0) return "";
  const parts: string[] = [];
  const cast = knownCast(
    bookmap,
    scenes.flatMap((s) => s.characters_present),
    args.ch,
  ).slice(0, CHAPTER_CAST_CAP);
  if (cast.length > 0) {
    parts.push(sentence(`Characters (keep consistent): ${cast.map(charLine).join("; ")}`));
  }
  const places = [...new Set(scenes.map((s) => oneLine(s.setting.location)).filter((p) => p !== ""))].slice(
    0,
    PLACE_CAP,
  );
  if (places.length > 0) parts.push(sentence(`Places: ${places.join("; ")}`));
  const cover = oneLine(bookmap.chapters.find((c) => c.ch === args.ch)?.cover_description ?? "");
  if (cover) parts.push(sentence(`Key panel: ${clipWords(cover, COVER_CHARS)}`));
  return block(parts);
}
