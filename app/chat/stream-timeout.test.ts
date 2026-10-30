// Chat SSE idle budget: a stalled stream fails retryable, while a slow
// but steady one completes. Runs in node: runStream needs no DOM.
import { describe, expect, it } from "vitest";
import { runStream } from "./use-chat";

function stalledResponse(): Response {
  return new Response(new ReadableStream<Uint8Array>({ start() {} }));
}

function pacedResponse(frames: string[], gapMs: number): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        frames.forEach((frame, i) => {
          setTimeout(() => {
            c.enqueue(encoder.encode(frame));
            if (i === frames.length - 1) c.close();
          }, gapMs * (i + 1));
        });
      },
    }),
  );
}

describe("runStream idle timeout", () => {
  it("throws the retryable code when the stream stalls", async () => {
    const seen: [string, string][] = [];
    await expect(
      runStream(stalledResponse(), new AbortController().signal, (e, d) => seen.push([e, d]), 20),
    ).rejects.toEqual({ code: "unavailable" });
    expect(seen).toEqual([]);
  });

  it("completes when every read lands inside the budget", async () => {
    const seen: [string, string][] = [];
    await runStream(
      pacedResponse(['event: delta\ndata: {"text":"hi"}\n\n', "event: done\ndata: {}\n\n"], 5),
      new AbortController().signal,
      (e, d) => seen.push([e, d]),
      200,
    );
    expect(seen).toEqual([
      ["delta", '{"text":"hi"}'],
      ["done", "{}"],
    ]);
  });
});
