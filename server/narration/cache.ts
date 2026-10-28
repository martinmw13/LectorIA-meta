import "server-only";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { list } from "@vercel/blob";
import { parseChapterNarration } from "@/core/narration";
import type { ChapterNarration } from "@/core/narration";
import { ensureChapterNarration } from "@/core/narration-cache";
import type { NarrationDeps } from "@/core/narration-cache";
import { DAILY_SPEND_TTL_SEC, budgetExceeded, dailySpendKey, spendKey } from "@/core/images";
import type { KV } from "@/core/images";

export const NARRATION_LOCK_TTL_SEC = 300;

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

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
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
        const page = await list({ prefix: path, limit: 10 });
        const url = page.blobs.find((b) => b.pathname === path)?.url ?? null;
        if (!url) return null;
        try {
          const response = await fetch(url);
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
        const total = await kv.incrBy(spendKey(), micro);
        if (budgetExceeded(total, env.spendCapMicro)) {
          await kv.decrBy(spendKey(), micro);
          return false;
        }
        const day = utcDay();
        const dailyTotal = await kv.incrBy(dailySpendKey(day), micro);
        await kv.expire(dailySpendKey(day), DAILY_SPEND_TTL_SEC);
        if (budgetExceeded(dailyTotal, env.dailySpendCapMicro)) {
          await kv.decrBy(dailySpendKey(day), micro);
          await kv.decrBy(spendKey(), micro);
          return false;
        }
        return true;
      },
      refund: async (micro: number) => {
        await kv.decrBy(spendKey(), micro);
        await kv.decrBy(dailySpendKey(utcDay()), micro);
      },
    },
    synthesize,
  };
}

export { ensureChapterNarration };
