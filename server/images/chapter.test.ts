import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MSG_BAD_REQUEST,
  createMemoryKV,
  dailySpendKey,
  spendKey,
} from "@/core/images";
import type { ImageGenerator, ImageRequest, ImageStore } from "@/core/images";
import { loadOzBook } from "@/server/books";
import type { ImageEnv } from "./env";
import { handleImagesPost } from "./handler";
import { orchestrate } from "./orchestrate";
import type { OrchestrateDeps } from "./orchestrate";

const env: ImageEnv = {
  upstashUrl: "https://x",
  upstashToken: "t",
  metaKey: "m",
  sessionSecret: "s",
  ipSalt: "salt",
  spendCapMicro: 10_000_000,
  dailySpendCapMicro: 1_500_000,
};

const content = {
  passageText: "",
  sceneTitle: "The Cyclone",
  sceneClip: "",
  chapterPanels: [{ description: "Dorothy runs to the cellar." }, { description: "The house lifts away." }],
};

const chapter = (ch: number): ImageRequest => ({ kind: "chapter", bookId: "oz", textVersion: "t", ch });

function deps(over: Partial<OrchestrateDeps> = {}): OrchestrateDeps {
  const files = new Map<string, Uint8Array>();
  const store: ImageStore = {
    findUrl: async (path) => (files.has(path) ? `https://blob.example/${path}` : null),
    save: async (path, bytes) => {
      if (files.has(path)) throw new Error("overwrite");
      files.set(path, bytes);
      return `https://blob.example/${path}`;
    },
  };
  const generate: ImageGenerator = {
    generate: async () => new Uint8Array([1, 2, 3]),
  };
  return {
    kv: createMemoryKV(),
    store,
    generate,
    env,
    content,
    ip: "1.2.3.4",
    anonId: "anon-1",
    day: "2026-10-27",
    ...over,
  };
}

describe("orchestrate chapter pages", () => {
  it("builds the chapter prompt and captions it with the chapter title", async () => {
    let prompt = "";
    const d = deps({
      generate: {
        generate: async (p: string) => {
          prompt = p;
          return new Uint8Array([9]);
        },
      },
    });
    const res = await orchestrate(chapter(1), d);
    expect(res).toMatchObject({ status: "ready", cached: false, caption: "The Cyclone" });
    expect(prompt).toContain('Chapter "The Cyclone"');
    expect(prompt).toContain("Panel 1:");
    expect(prompt).toContain("Panel 2:");
    expect(prompt).toContain("speech balloons");
  });

  it("serves a cached hit without quota, spend, or generate", async () => {
    let calls = 0;
    const d = deps({
      generate: {
        generate: async () => {
          calls++;
          return new Uint8Array([9]);
        },
      },
    });
    expect((await orchestrate(chapter(1), d)).status).toBe("ready");
    const second = await orchestrate(chapter(1), { ...d, ip: "9.9.9.9", anonId: "fresh" });
    expect(second).toMatchObject({ status: "ready", cached: true, caption: "The Cyclone" });
    expect(calls).toBe(1);
    expect(await d.kv.get(spendKey())).toBe("10000");
    expect(await d.kv.get(dailySpendKey("2026-10-27"))).toBe("10000");
  });

  it("counts one quota and one spend per miss", async () => {
    const d = deps();
    const first = await orchestrate(chapter(1), d);
    expect(first.status).toBe("ready");
    expect(await d.kv.get(spendKey())).toBe("10000");
    expect(await d.kv.get(dailySpendKey("2026-10-27"))).toBe("10000");
    for (const ch of [2, 3, 4, 5]) {
      expect((await orchestrate(chapter(ch), d)).status).toBe("ready");
    }
    expect(await d.kv.get(spendKey())).toBe("50000");
    const refused = await orchestrate(chapter(6), d);
    expect(refused).toMatchObject({ status: "error", code: "quota" });
    expect(await d.kv.get(spendKey())).toBe("50000");
  });
});

const REQUIRED = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "BLOB_READ_WRITE_TOKEN",
  "META_API_KEY",
  "SESSION_SECRET",
  "IP_HASH_SALT",
] as const;

const KV_FALLBACK = ["KV_REST_API_URL", "KV_REST_API_TOKEN"] as const;
const ALL_ENV = [...REQUIRED, ...KV_FALLBACK];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ALL_ENV) saved[k] = process.env[k];
});

afterEach(() => {
  for (const k of ALL_ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

describe("handleImagesPost chapter pages", () => {
  it("rejects an unknown chapter with 400 and no network call", async () => {
    for (const k of REQUIRED) process.env[k] = `test-${k}`;
    process.env.UPSTASH_REDIS_REST_URL = "https://test.example";
    const fetchSpy = vi.fn().mockRejectedValue(new Error("must not be called"));
    vi.stubGlobal("fetch", fetchSpy);
    const { book } = loadOzBook();
    const res = await handleImagesPost(
      new Request("http://localhost/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "chapter", bookId: book.id, textVersion: book.textVersion, ch: 999 }),
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "error",
      code: "bad_request",
      message: MSG_BAD_REQUEST,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
