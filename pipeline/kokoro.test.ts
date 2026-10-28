// createKokoroClient against a stubbed Modal SDK: a well-shaped
// response passes through with word timings, anything else fails with
// the generic message and never leaks SDK errors.
import { describe, expect, it, vi } from "vitest";

let remoteOut: unknown;

vi.mock("modal", () => ({
  ModalClient: class {
    functions = {
      fromName: async () => ({
        remote: async () => {
          if (remoteOut instanceof Error) throw remoteOut;
          return remoteOut;
        },
      }),
    };
  },
}));

import { createKokoroClient } from "./kokoro";

function good() {
  return {
    mp3: new Uint8Array([1, 2, 3]),
    durationSec: 4,
    spans: [{ t0: 0, t1: 3.5, words: [["hi", 0.5, 1.5]] }],
    gpuSec: 1,
  };
}

describe("createKokoroClient", () => {
  it("passes a well-shaped response through with word timings", async () => {
    remoteOut = good();
    const out = await createKokoroClient().synthesize({ texts: ["hi"], gaps: [0], voice: "af_heart", speed: 0.95 });
    expect(out.spans).toEqual([{ t0: 0, t1: 3.5, words: [["hi", 0.5, 1.5]] }]);
    expect(out.mp3).toBeInstanceOf(Uint8Array);
  });

  it("rejects malformed word shapes with the generic message", async () => {
    const badSpans: unknown[] = [
      [{ t0: 0, t1: 1 }],
      [{ t0: 0, t1: 1, words: "hi" }],
      [{ t0: 0, t1: 1, words: [["hi", 0.5]] }],
      [{ t0: 0, t1: 1, words: [[42, 0.5, 1.5]] }],
      [{ t0: 0, t1: 1, words: [["hi", Number.NaN, 1.5]] }],
    ];
    for (const spans of badSpans) {
      remoteOut = { ...good(), spans };
      await expect(createKokoroClient().synthesize({ texts: ["hi"], gaps: [0], voice: "af_heart", speed: 0.95 })).rejects.toThrow(
        "narration synthesize failed",
      );
    }
  });

  it("hides SDK errors behind the generic message", async () => {
    remoteOut = new Error("modal sdk exploded: secret=abc");
    await expect(createKokoroClient().synthesize({ texts: ["hi"], gaps: [0], voice: "af_heart", speed: 0.95 })).rejects.toThrow(
      "narration synthesize failed",
    );
  });
});
