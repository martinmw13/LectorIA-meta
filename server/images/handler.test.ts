import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadOzBook } from "@/server/books";
import { handleImagesPost } from "./handler";

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

function passageBody() {
  const { book } = loadOzBook();
  const first = book.paragraphs[0];
  if (!first) throw new Error("test book has no paragraphs");
  return { kind: "passage", bookId: book.id, textVersion: book.textVersion, n: first.n };
}

function post(body: unknown): Request {
  return new Request("http://localhost/api/images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("handleImagesPost", () => {
  it("returns unavailable without touching quota when env is missing", async () => {
    for (const k of ALL_ENV) delete process.env[k];
    const fetchSpy = vi.fn().mockRejectedValue(new Error("must not be called"));
    vi.stubGlobal("fetch", fetchSpy);
    const res = await handleImagesPost(post(passageBody()));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: "error", code: "unavailable" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns generic text when KV throws", async () => {
    for (const k of REQUIRED) process.env[k] = `test-${k}`;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("upstash-boom-marker")),
    );
    const res = await handleImagesPost(post(passageBody()));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json).toMatchObject({ status: "error", code: "unavailable" });
    expect(JSON.stringify(json)).not.toContain("upstash-boom-marker");
  });
});
