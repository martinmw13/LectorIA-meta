import "server-only";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { list } from "@vercel/blob";
import { parseChapterNarration } from "@/core/narration";
import type { ChapterNarration } from "@/core/narration";
import { ensureChapterNarration } from "@/core/narration-cache";
import type { NarrationDeps } from "@/core/narration-cache";
import type { KV } from "@/core/types";
import { utcDay } from "@/server/guard/request";
import { reserveSpend } from "@/server/guard/spend";
import type { SpendReservation } from "@/server/guard/spend";

export const NARRATION_LOCK_TTL_SEC = 300;

// Blob and manifest reads fail fast, so a slow store still leaves time
// for the budget refund and the lock release.
const NARRATION_TIMEOUT_MS = 8_000;

export interface NarrationEnv {
  spendCapMicro: number;
  dailySpendCapMicro: number;
}

function indexKeyFor(key: string): string {
  return `narr:idx:${key}`;
}

function lockKeyFor(key: string): string {
  return `narr:lock:${key}`;
}

// Deps for the future upload route: the Redis index dedupes concurrent
// readers (a second reader of the same text gets it free), the lock has
// a 300 s TTL, and the budget reserves on both spend caps only when
// generating. Narration always uses our Modal credits: no BYOK path.
export function createNarrationDeps(args: {
  kv: KV;
  env: NarrationEnv;
  synthesize: NarrationDeps["synthesize"];
}): NarrationDeps {
  const { kv, env, synthesize } = args;
  // The reservation refunds the day that was charged, even if the job
  // crosses UTC midnight.
  let reservation: SpendReservation | null = null;
  return {
    sha256Hex: async (text: string) => {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    },
    index: {
      get: async (key: string) => {
        const raw = await kv.get(indexKeyFor(key));
        if (!raw) return null;
        try {
          return parseChapterNarration(JSON.parse(raw) as unknown);
        } catch {
          return null;
        }
      },
      set: async (key: string, value: ChapterNarration) => {
        await kv.set(indexKeyFor(key), JSON.stringify(value));
      },
    },
    store: {
      getManifest: async (key: string) => {
        const path = `${key}.json`;
        const page = await list({ prefix: path, limit: 10, abortSignal: AbortSignal.timeout(NARRATION_TIMEOUT_MS) });
        const url = page.blobs.find((b) => b.pathname === path)?.url ?? null;
        if (!url) return null;
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(NARRATION_TIMEOUT_MS) });
          if (!response.ok) return null;
          return parseChapterNarration((await response.json()) as unknown);
        } catch {
          return null;
        }
      },
      putAudio: async (key: string, mp3: Uint8Array) => {
        const blob = await put(`${key}.mp3`, Buffer.from(mp3), {
          access: "public",
          addRandomSuffix: false,
          allowOverwrite: false,
          contentType: "audio/mpeg",
          cacheControlMaxAge: 31536000,
          abortSignal: AbortSignal.timeout(NARRATION_TIMEOUT_MS),
        });
        return blob.url;
      },
      putManifest: async (key: string, value: ChapterNarration) => {
        await put(`${key}.json`, JSON.stringify(value), {
          access: "public",
          addRandomSuffix: false,
          allowOverwrite: false,
          contentType: "application/json",
          cacheControlMaxAge: 31536000,
          abortSignal: AbortSignal.timeout(NARRATION_TIMEOUT_MS),
        });
      },
    },
    lock: {
      acquire: async (key: string) => {
        const token = randomUUID();
        return (await kv.setNxEx(lockKeyFor(key), token, NARRATION_LOCK_TTL_SEC)) ? token : null;
      },
      release: async (key: string, token: string) => {
        await kv.releaseIfToken(lockKeyFor(key), token);
      },
    },
    budget: {
      reserve: async (micro: number) => {
        const spent = await reserveSpend(kv, {
          amountMicro: micro,
          day: utcDay(),
          spendCapMicro: env.spendCapMicro,
          dailySpendCapMicro: env.dailySpendCapMicro,
        });
        if (!spent.ok) return false;
        reservation = spent.reservation;
        return true;
      },
      // Best effort: a Redis failure here must never become a client 500.
      refund: async (_micro: number) => {
        await reservation?.release();
        reservation = null;
      },
    },
    synthesize,
  };
}

export { ensureChapterNarration };
