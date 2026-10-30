import { describe, expect, it, vi } from "vitest";
import { createMemoryKV, imageKey } from "@/core/images";
import type { ImageStore } from "@/core/images";
import { parseStyleChoice } from "@/core/image-style";
import { loadBookData } from "@/server/books";
import { issueHumanCookie } from "@/server/guard/human";
import type { ImageEnv } from "./env";
import { buildPregenChapterPrompt } from "./final-prompt";
import { handleImagesPost } from "./handler";

const { book, scenes } = await loadBookData("oz");
const { book: aliceBook, scenes: aliceScenes } = await loadBookData("alice");
const secret = "test-session-secret";

const env: ImageEnv = {
  upstashUrl: "https://kv.example",
  upstashToken: "kv-token",
  metaKey: "test-meta",
  sessionSecret: secret,
  ipSalt: "test-salt",
  spendCapMicro: 10_000_000,
  dailySpendCapMicro: 2_000_000,
  turnstileSecret: "ts-secret",
  turnstileSiteKey: "ts-site",
};

describe("pregen prompt parity", () => {
  it("matches the route prompt for Oz ch1 with a preset style", async () => {
    const style = parseStyleChoice({ preset: "watercolor" });
    let routePrompt = "";
    let savedPath = "";
    const generate = {
      generate: async (p: string) => {
        routePrompt = p;
        return new Uint8Array([1, 2, 3]);
      },
    };
    const store: ImageStore = {
      findUrl: async () => null,
      save: async (path) => {
        savedPath = path;
        return `https://blob.example/${path}`;
      },
    };
    const siteFetch = vi.fn(async () => {
      throw new Error("siteverify must not be called");
    });
    const cookie = issueHumanCookie(secret).split(";")[0] as string;
    const res = await handleImagesPost(
      new Request("http://localhost/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          kind: "chapter",
          bookId: book.id,
          textVersion: book.textVersion,
          ch: 1,
          reachedCh: 1,
          style: { preset: "watercolor" },
        }),
      }),
      { env, kv: createMemoryKV(), store, generate, fetchFn: siteFetch as unknown as typeof fetch },
    );
    expect(res.status).toBe(200);
    expect(siteFetch).not.toHaveBeenCalled();
    const scriptPrompt = buildPregenChapterPrompt({ book, scenes, ch: 1, style });
    expect(scriptPrompt).toBe(routePrompt);
    expect(scriptPrompt).toContain("Reference details:");
    // Pregen keys with the same imageKey call, so the stored page matches the route's key.
    expect(savedPath).toBe(
      imageKey({ kind: "chapter", bookId: book.id, textVersion: book.textVersion, ch: 1, reachedCh: 1, ...(style === undefined ? {} : { style }) }),
    );
  });

  it("matches the route prompt for alice ch1 with a preset style", async () => {
    const style = parseStyleChoice({ preset: "watercolor" });
    let routePrompt = "";
    let savedPath = "";
    const generate = {
      generate: async (p: string) => {
        routePrompt = p;
        return new Uint8Array([1, 2, 3]);
      },
    };
    const store: ImageStore = {
      findUrl: async () => null,
      save: async (path) => {
        savedPath = path;
        return `https://blob.example/${path}`;
      },
    };
    const siteFetch = vi.fn(async () => {
      throw new Error("siteverify must not be called");
    });
    const cookie = issueHumanCookie(secret).split(";")[0] as string;
    const res = await handleImagesPost(
      new Request("http://localhost/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          kind: "chapter",
          bookId: aliceBook.id,
          textVersion: aliceBook.textVersion,
          ch: 1,
          reachedCh: 1,
          style: { preset: "watercolor" },
        }),
      }),
      { env, kv: createMemoryKV(), store, generate, fetchFn: siteFetch as unknown as typeof fetch },
    );
    expect(res.status).toBe(200);
    expect(siteFetch).not.toHaveBeenCalled();
    const scriptPrompt = buildPregenChapterPrompt({ book: aliceBook, scenes: aliceScenes, ch: 1, style });
    expect(scriptPrompt).toBe(routePrompt);
    expect(scriptPrompt).toContain("Reference details:");
    expect(scriptPrompt).not.toContain("silver shoes");
    expect(savedPath).toBe(
      imageKey({ kind: "chapter", bookId: aliceBook.id, textVersion: aliceBook.textVersion, ch: 1, reachedCh: 1, ...(style === undefined ? {} : { style }) }),
    );
  });
});
