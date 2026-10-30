import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BYOK_HEADER } from "@/core/chat";
import { createMemoryKV } from "@/core/images";
import { handleChatPost } from "./handler";
import { resetTurnstileWarnForTests } from "@/server/guard/human";
import { ENV, NOW, OK_CHUNKS, errBody, factoryFor, post, validBody } from "./test-fixtures";
import type { Capture } from "./test-fixtures";

let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  resetTurnstileWarnForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleChatPost across books", () => {
  it("answers from another registered book's text", async () => {
    const kv = createMemoryKV();
    const capture: Capture = {};
    const res = await handleChatPost(post(validBody({ bookId: "alice", upToN: 10 })), {
      env: ENV,
      kv,
      now: NOW,
      createStreamer: factoryFor(OK_CHUNKS, capture),
    });
    expect(res.status).toBe(200);
    // Keyless test env: the only error call is the deliberate
    // turnstile-skipped warning from the human check.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("turnstile not configured"));
    await res.text();
    const system = capture.messages?.[0]?.content ?? "";
    expect(system).toContain("Down the Rabbit-Hole");
    expect(system).toContain("Alice was beginning");
    expect(system).not.toContain("cyclone cellar");
  });

  it("rejects an unknown book id with 400", async () => {
    const res = await handleChatPost(post(validBody({ bookId: "nope" })), {
      env: ENV,
      kv: createMemoryKV(),
      now: NOW,
      createStreamer: factoryFor(OK_CHUNKS),
    });
    expect(res.status).toBe(400);
    expect((await errBody(res)).code).toBe("bad_request");
  });

  it("logs the real book id on failures", async () => {
    const kv = createMemoryKV();
    const res = await handleChatPost(post(validBody({ bookId: "alice" }), { [BYOK_HEADER]: "abc" }), {
      env: ENV,
      kv,
      createStreamer: factoryFor(OK_CHUNKS),
    });
    expect(res.status).toBe(400);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("book=alice"));

    warnSpy.mockClear();
    const unknown = await handleChatPost(post(validBody({ bookId: "nope" })), {
      env: ENV,
      kv: createMemoryKV(),
      createStreamer: factoryFor(OK_CHUNKS),
    });
    expect(unknown.status).toBe(400);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("book=nope"));
  });
});
