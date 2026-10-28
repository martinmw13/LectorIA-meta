import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  NARRATION_FORMAT,
  NARRATION_MODEL,
  NARRATION_SPEED,
  NARRATION_VOICE,
  PARAGRAPH_GAP_SEC,
  SENTENCE_GAP_SEC,
  activeChunkAt,
  actualNarrationMicro,
  chapterChunks,
  chaptersToPrepare,
  estimateNarrationMicro,
  narrationKey,
  narrationKeyInput,
  parseChapterNarration,
  sceneSpan,
  splitSentences,
} from "./narration";

const OZ = `“I am Oz, the Great and Terrible,” said the little man, in a trembling voice. “But don't strike me — please don't — and I will do anything you want me to do.” “Oh, you're a humbug!” said Dorothy. Mr. H. M. Wogglebug rushed — very fast — toward the door!” said Dorothy, turning pale.`;

// Oz-style text: curly quotes, a dialogue tag after a quoted sentence,
// and a quote ending the paragraph (see OZ for em dashes and Mr.).
const OZ_PARA = "\u201cYou have plenty of courage, I am sure,\u201d answered Oz. \u201cAll you need is confidence in yourself.\u201d\n"

describe("splitSentences", () => {
  it("covers every non-space char with trimmed offsets", () => {
    const spans = splitSentences(OZ_PARA);
    expect(spans.length).toBeGreaterThan(0);
    for (const span of spans) {
      expect(OZ_PARA[span.start]).toMatch(/\S/);
      expect(OZ_PARA[span.end - 1]).toMatch(/\S/);
    }
    const covered = spans.map((s) => OZ_PARA.slice(s.start, s.end).replace(/\s+/g, " ").trim()).join(" ");
    expect(covered.replace(/\s+/g, " ").trim()).toBe(OZ_PARA.replace(/\s+/g, " ").trim());
  });

  it("does not end after Mr. or a single capital initial", () => {
    const spans = splitSentences(`Mr. H. M. Wogglebug rushed toward the door and knocked loudly.`);
    expect(spans).toHaveLength(1);
  });

  it("ends at ! and ? plus closing quotes before whitespace", () => {
    const spans = splitSentences(`“Oh, you're a humbug!” said Dorothy. Are you quite sure about that?`);
    expect(spans).toHaveLength(2);
    // "said Dorothy." is two words, so it merges into the sentence before it.
    expect(spans[0]).toEqual({ start: 0, end: `“Oh, you're a humbug!” said Dorothy.`.length });
  });

  it("ends a paragraph-final quote without trailing space", () => {
    const text = `She whispered, “do not be afraid.”`;
    const spans = splitSentences(text);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toEqual({ start: 0, end: text.length });
  });

  it("merges a sub-3-word piece into its neighbor", () => {
    const spans = splitSentences(`The lion roared with tremendous courage. Yes! He ran away quickly.`);
    const texts = spans.map((s) => `The lion roared with tremendous courage. Yes! He ran away quickly.`.slice(s.start, s.end));
    expect(texts.some((t) => t === "Yes!")).toBe(false);
    expect(spans).toHaveLength(2);
  });

  it("handles the Oz sample end to end", () => {
    const spans = splitSentences(OZ);
    expect(spans.length).toBeGreaterThanOrEqual(3);
    expect(OZ.slice(spans[0]?.start, spans[0]?.end)).toContain("Great and Terrible");
  });
});

describe("chapterChunks", () => {
  it("uses paragraph gaps across paragraphs and sentence gaps within", () => {
    const { chunks, gaps } = chapterChunks([
      { n: 1, text: `The road was long and dusty. Dorothy walked on bravely.` },
      { n: 2, text: `Toto barked at the strange green light ahead.` },
    ]);
    expect(chunks).toHaveLength(3);
    expect(chunks.map((c) => c.n)).toEqual([1, 1, 2]);
    expect(gaps).toEqual([SENTENCE_GAP_SEC, PARAGRAPH_GAP_SEC, 0]);
    expect(chunks[0]).toMatchObject({ n: 1, start: 0, text: `The road was long and dusty.` });
  });
});

describe("cache keys", () => {
  const chunks = [{ text: `  The road was long.\n\nDorothy walked on.` }];

  function hashOf(input: string): string {
    return createHash("sha256").update(input).digest("hex");
  }

  it("is stable for the same text and moves on any edit", () => {
    const base = narrationKeyInput({ chunks, voice: NARRATION_VOICE, model: NARRATION_MODEL, speed: NARRATION_SPEED, format: NARRATION_FORMAT });
    const same = narrationKeyInput({ chunks: [{ text: "The road was long. Dorothy walked on." }], voice: NARRATION_VOICE, model: NARRATION_MODEL, speed: NARRATION_SPEED, format: NARRATION_FORMAT });
    expect(same).toBe(base);
    const edited = narrationKeyInput({ chunks: [{ text: "The road was long! Dorothy walked on." }], voice: NARRATION_VOICE, model: NARRATION_MODEL, speed: NARRATION_SPEED, format: NARRATION_FORMAT });
    expect(edited).not.toBe(base);
    expect(narrationKeyInput({ chunks, voice: "af_bella", model: NARRATION_MODEL, speed: NARRATION_SPEED, format: NARRATION_FORMAT })).not.toBe(base);
    expect(narrationKey(hashOf(base), NARRATION_VOICE)).toBe(
      `narration/v${NARRATION_FORMAT}/${NARRATION_VOICE}/${hashOf(base).slice(0, 32)}`,
    );
  });
});

describe("parseChapterNarration", () => {
  const good = {
    format: 1,
    key: "narration/v1/af_heart/abc",
    src: "/narration/v1/af_heart/abc.mp3",
    durationSec: 10,
    voice: "af_heart",
    model: "kokoro-82m/0.9.4",
    speed: 0.95,
    chunks: [
      { n: 1, start: 0, end: 5, t0: 0, t1: 4 },
      { n: 2, start: 0, end: 7, t0: 4.3, t1: 9.5 },
    ],
  };

  it("accepts a good manifest, including an https src", () => {
    expect(parseChapterNarration(good).chunks).toHaveLength(2);
    expect(parseChapterNarration({ ...good, src: "https://cdn.example.com/n.mp3" }).src).toContain("https://");
  });

  it("throws on any bad field", () => {
    const bad: unknown[] = [
      null,
      { ...good, format: 2 },
      { ...good, src: "http://evil.example.com/n.mp3" },
      { ...good, src: "/audio/n.mp3" },
      { ...good, src: "javascript:alert(1)" },
      { ...good, durationSec: Number.NaN },
      { ...good, chunks: [] },
      { ...good, chunks: [{ n: 1.5, start: 0, end: 5, t0: 0, t1: 4 }] },
      { ...good, chunks: [{ n: 1, start: 5, end: 5, t0: 0, t1: 4 }] },
      { ...good, chunks: [{ n: 1, start: 0, end: 5, t0: 4, t1: 4 }] },
      { ...good, chunks: [{ n: 1, start: 0, end: 5, t0: -1, t1: 4 }] },
      { ...good, chunks: [{ n: 1, start: 0, end: 5, t0: 0, t1: 11 }] },
      {
        ...good,
        chunks: [
          { n: 1, start: 0, end: 5, t0: 4, t1: 6 },
          { n: 2, start: 0, end: 5, t0: 0, t1: 3 },
        ],
      },
    ];
    for (const entry of bad) expect(() => parseChapterNarration(entry)).toThrow();
  });
});

describe("activeChunkAt", () => {
  const chunks = [{ t0: 0 }, { t0: 4.3 }, { t0: 8 }];
  it("holds the highlight through the gap after a sentence", () => {
    expect(activeChunkAt(chunks, -0.1)).toBe(-1);
    expect(activeChunkAt(chunks, 0)).toBe(0);
    expect(activeChunkAt(chunks, 4.2)).toBe(0);
    expect(activeChunkAt(chunks, 4.3)).toBe(1);
    expect(activeChunkAt(chunks, 99)).toBe(2);
  });
});

describe("sceneSpan", () => {
  const narration = {
    chunks: [
      { n: 1, t0: 0, t1: 4 },
      { n: 2, t0: 4.3, t1: 8 },
      { n: 5, t0: 8.3, t1: 12 },
    ],
  };
  it("spans the first to the last chunk in range", () => {
    expect(sceneSpan(narration, 1, 2)).toEqual({ startSec: 0, endSec: 8 });
    expect(sceneSpan(narration, 2, 4)).toEqual({ startSec: 4.3, endSec: 8 });
    expect(sceneSpan(narration, 3, 4)).toBeNull();
  });
});

describe("chaptersToPrepare", () => {
  it("follows the owner's rolling window", () => {
    expect(chaptersToPrepare("upload", 1, 24)).toEqual([1, 2]);
    expect(chaptersToPrepare("enter", 5, 24)).toEqual([6, 7]);
    expect(chaptersToPrepare("jump", 5, 24)).toEqual([5, 6]);
    expect(chaptersToPrepare("enter", 24, 24)).toEqual([]);
    expect(chaptersToPrepare("jump", 24, 24)).toEqual([24]);
    expect(chaptersToPrepare("upload", 1, 1)).toEqual([1]);
  });
});

describe("cost", () => {
  it("estimates an average Oz chapter near USD 0.003 warm", () => {
    // ~9,000 chars ≈ 10 min of audio: 9000/15*0.02+8 = 20 s GPU.
    const micro = estimateNarrationMicro(9000);
    expect(micro).toBe(Math.ceil(20 * 0.000222 * 1e6));
    expect(micro / 1e6).toBeCloseTo(0.0044, 3);
    expect(actualNarrationMicro(7.1)).toBe(Math.ceil(7.1 * 0.000222 * 1e6));
    expect(Number.isInteger(estimateNarrationMicro(0))).toBe(true);
  });
});
