import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BODY_BYTES, readBodyCapped } from "./body";

function textPost(text: string, headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/images", { method: "POST", headers, body: text });
}

function streamPost(chunks: string[]): Request {
  const enc = new TextEncoder();
  return new Request("http://localhost/api/images", {
    method: "POST",
    body: new ReadableStream({
      start(c) {
        for (const s of chunks) c.enqueue(enc.encode(s));
        c.close();
      },
    }),
    duplex: "half",
  } as RequestInit);
}

describe("readBodyCapped", () => {
  it("round-trips a small body", async () => {
    const res = await readBodyCapped(textPost('{"kind":"passage"}'));
    expect(res).toEqual({ ok: true, text: '{"kind":"passage"}' });
  });

  it("accepts exactly the limit", async () => {
    const res = await readBodyCapped(textPost("a".repeat(MAX_IMAGE_BODY_BYTES)));
    expect(res.ok).toBe(true);
  });

  it("rejects one byte over the limit", async () => {
    const res = await readBodyCapped(textPost("a".repeat(MAX_IMAGE_BODY_BYTES + 1)));
    expect(res).toEqual({ ok: false, reason: "too_large" });
  });

  it("rejects an oversize content-length without reading the body", async () => {
    const res = await readBodyCapped(
      textPost("{}", { "content-length": String(MAX_IMAGE_BODY_BYTES + 1) }),
    );
    expect(res).toEqual({ ok: false, reason: "too_large" });
  });

  it("rejects a lying small content-length once the stream exceeds the limit", async () => {
    const res = await readBodyCapped(
      textPost("a".repeat(MAX_IMAGE_BODY_BYTES + 100), { "content-length": "10" }),
    );
    expect(res).toEqual({ ok: false, reason: "too_large" });
  });

  it("rejects a big streamed body with no content-length", async () => {
    const res = await readBodyCapped(streamPost(["a".repeat(9000)]));
    expect(res).toEqual({ ok: false, reason: "too_large" });
  });

  it("aborts early on a large multi-chunk stream", async () => {
    const res = await readBodyCapped(streamPost(["a".repeat(100), "b".repeat(9000)]));
    expect(res).toEqual({ ok: false, reason: "too_large" });
  });

  it("treats a null body as empty text", async () => {
    const req = new Request("http://localhost/api/images", { method: "POST" });
    expect(await readBodyCapped(req)).toEqual({ ok: true, text: "" });
  });

  it("treats a stream error as unreadable instead of throwing", async () => {
    const req = new Request("http://localhost/api/images", {
      method: "POST",
      body: new ReadableStream({
        start(c) {
          c.error(new Error("boom-marker-client-abort"));
        },
      }),
      duplex: "half",
    } as RequestInit);
    await expect(readBodyCapped(req)).resolves.toEqual({ ok: false, reason: "read_error" });
  });
});
