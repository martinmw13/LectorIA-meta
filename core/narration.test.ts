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
  activeWordAt,
  actualNarrationMicro,
  alignWords,
  chapterChunks,
  chaptersToPrepare,
  estimateNarrationMicro,
  narrationKey,
  narrationKeyInput,
  parseChapterNarration,
  sceneSpan,
  splitSentences,
  wordAt,
} from "./narration";
import type { WordToken } from "./narration";
import probeRaw from "./fixtures/kokoro-probe.json";

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
    format: 2,
    key: "narration/v2/af_heart/abc",
    src: "/narration/v2/af_heart/abc.mp3",
    durationSec: 10,
    voice: "af_heart",
    model: "kokoro-82m/0.9.4",
    speed: 0.95,
    chunks: [
      { n: 1, start: 0, end: 5, t0: 0, t1: 4, w: [0, 5, 0.5, 3.5] },
      { n: 2, start: 0, end: 7, t0: 4.3, t1: 9.5, w: [0, 3, 4.5, 6, 3, 7, 6, 9] },
    ],
  };

  it("accepts a good manifest, including an https src", () => {
    expect(parseChapterNarration(good).chunks).toHaveLength(2);
    expect(parseChapterNarration({ ...good, src: "https://cdn.example.com/n.mp3" }).src).toContain("https://");
  });

  it("throws on any bad field", () => {
    const bad: unknown[] = [
      null,
      { ...good, format: 1 },
      { ...good, src: "http://evil.example.com/n.mp3" },
      { ...good, src: "/audio/n.mp3" },
      { ...good, src: "javascript:alert(1)" },
      { ...good, durationSec: Number.NaN },
      { ...good, chunks: [] },
      { ...good, chunks: [{ n: 1.5, start: 0, end: 5, t0: 0, t1: 4, w: [] }] },
      { ...good, chunks: [{ n: 1, start: 5, end: 5, t0: 0, t1: 4, w: [] }] },
      { ...good, chunks: [{ n: 1, start: 0, end: 5, t0: 4, t1: 4, w: [] }] },
      { ...good, chunks: [{ n: 1, start: 0, end: 5, t0: -1, t1: 4, w: [] }] },
      { ...good, chunks: [{ n: 1, start: 0, end: 5, t0: 0, t1: 11, w: [] }] },
      {
        ...good,
        chunks: [
          { n: 1, start: 0, end: 5, t0: 4, t1: 6, w: [] },
          { n: 2, start: 0, end: 5, t0: 0, t1: 3, w: [] },
        ],
      },
      { ...good, chunks: [{ n: 1, start: 0, end: 5, t0: 0, t1: 4 }] },
      { ...good, chunks: [{ n: 1, start: 0, end: 5, t0: 0, t1: 4, w: [0, 5, 0.5] }] },
      { ...good, chunks: [{ n: 1, start: 0, end: 5, t0: 0, t1: 4, w: [0, 5, 0.5, Number.NaN] }] },
      { ...good, chunks: [{ n: 1, start: 0, end: 5, t0: 0, t1: 4, w: [0, 5.5, 0.5, 3.5] }] },
      { ...good, chunks: [{ n: 1, start: 0, end: 5, t0: 0, t1: 4, w: [0, 6, 0.5, 3.5] }] },
      { ...good, chunks: [{ n: 1, start: 0, end: 5, t0: 0, t1: 4, w: [0, 5, 0.5, 4.5] }] },
      { ...good, chunks: [{ n: 1, start: 0, end: 5, t0: 0, t1: 4, w: [3, 5, 0.5, 3.5, 0, 2, 0.5, 3.5] }] },
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

interface ProbeResult {
  graphemes: string;
  n: number;
  tokens: [string, string, number | null, number | null][];
}

const probe = probeRaw as unknown as ProbeResult[];

// The probe's sentence, as displayed in the paragraph. Kokoro heard the
// same text (em dashes are no longer rewritten), so its tokens line up.
const READALONG = `“Oh, dear!” said Dorothy—she was frightened. Mr. Oz’s balloon rose 3 feet, didn't it?`;

const READALONG_WORDS = [
  "Oh", "dear", "said", "Dorothy", "she", "was", "frightened",
  "Mr", "Oz’s", "balloon", "rose", "3", "feet", "didn't", "it",
];

// Probe tokens with null timings dropped and times made absolute,
// punctuation tokens included: alignWords must skip them.
function probeTokens(spanT0: number): WordToken[] {
  const out: WordToken[] = [];
  for (const [text, , s, e] of (probe[0] as ProbeResult).tokens) {
    if (s === null || e === null) continue;
    out.push({ text, t0: spanT0 + s, t1: spanT0 + e });
  }
  return out;
}

function checkWellFormed(words: [number, number, number, number][], text: string, span: { t0: number; t1: number }): void {
  let prevT0 = span.t0;
  for (const [s, e, t0, t1] of words) {
    expect(Number.isInteger(s)).toBe(true);
    expect(Number.isInteger(e)).toBe(true);
    expect(s).toBeLessThan(e);
    expect(text.slice(s, e)).toMatch(/^[\p{L}\p{N}]/u);
    expect(t0).toBeGreaterThanOrEqual(span.t0);
    expect(t1).toBeLessThanOrEqual(span.t1);
    expect(t0).toBeLessThanOrEqual(t1);
    expect(t0).toBeGreaterThanOrEqual(prevT0);
    prevT0 = t0;
  }
}

describe("alignWords", () => {
  it("maps the probe tokens onto every display word", () => {
    const span = { t0: 10, t1: 16 };
    const words = alignWords(READALONG, probeTokens(span.t0), span);
    expect(words.map(([s, e]) => READALONG.slice(s, e))).toEqual(READALONG_WORDS);
    // "Mr." covers "Mr" and "Oz’s" matches across the apostrophe.
    expect(words[7]?.[2]).toBeCloseTo(13.0375, 2);
    expect(words[8]?.[2]).toBeCloseTo(13.3875, 2);
    expect(words[3]?.[2]).toBeCloseTo(11.275, 2);
    expect(words[3]?.[3]).toBeCloseTo(11.775, 2);
    checkWellFormed(words, READALONG, span);
  });

  it("interpolates a missing token between its neighbours", () => {
    const span = { t0: 0, t1: 6 };
    const words = alignWords(READALONG, probeTokens(0).filter((t) => t.text !== "balloon"), span);
    expect(words.map(([s, e]) => READALONG.slice(s, e))).toEqual(READALONG_WORDS);
    // "rose" still keeps its Kokoro time after the gap.
    expect(words[10]?.[2]).toBeCloseTo(4.225, 2);
    const balloon = words[9] as [number, number, number, number];
    expect(balloon[2]).toBeGreaterThanOrEqual((words[8] as [number, number, number, number])[3]);
    expect(balloon[3]).toBeLessThanOrEqual((words[10] as [number, number, number, number])[2]);
    checkWellFormed(words, READALONG, span);
  });

  it("skips an extra token without derailing the rest", () => {
    const span = { t0: 0, t1: 6 };
    const tokens = probeTokens(0);
    tokens.splice(4, 0, { text: "um", t0: 0.6, t1: 0.7 });
    const words = alignWords(READALONG, tokens, span);
    expect(words.map(([s, e]) => READALONG.slice(s, e))).toEqual(READALONG_WORDS);
    expect(words[2]?.[2]).toBeCloseTo(1.125, 3);
    checkWellFormed(words, READALONG, span);
  });

  it("survives a number Kokoro spells out", () => {
    const span = { t0: 0, t1: 6 };
    const tokens = probeTokens(0).map((t) => (t.text === "3" ? { ...t, text: "three" } : t));
    const words = alignWords(READALONG, tokens, span);
    expect(words.map(([s, e]) => READALONG.slice(s, e))).toEqual(READALONG_WORDS);
    expect(words[12]?.[2]).toBeCloseTo(4.8125, 2);
    const three = words[11] as [number, number, number, number];
    expect(three[2]).toBeGreaterThanOrEqual((words[10] as [number, number, number, number])[3]);
    expect(three[3]).toBeLessThanOrEqual((words[12] as [number, number, number, number])[2]);
    checkWellFormed(words, READALONG, span);
  });

  it("matches straight quotes against curly ones", () => {
    const text = `Oz's "quoted" didn't`;
    const span = { t0: 0, t1: 3 };
    const words = alignWords(
      text,
      [
        { text: "Oz’s", t0: 0, t1: 1 },
        { text: "quoted", t0: 1, t1: 2 },
        { text: "didn’t", t0: 2, t1: 3 },
      ],
      span,
    );
    expect(words.map(([s, e]) => text.slice(s, e))).toEqual(["Oz's", "quoted", "didn't"]);
    expect(words.map(([, , t0]) => t0)).toEqual([0, 1, 2]);
  });

  it("splits a compound token across its display words by length", () => {
    const text = "well-known fact";
    const words = alignWords(
      text,
      [
        { text: "well-known", t0: 1, t1: 2 },
        { text: "fact", t0: 2, t1: 3 },
      ],
      { t0: 0, t1: 4 },
    );
    expect(words.map(([s, e]) => text.slice(s, e))).toEqual(["well", "known", "fact"]);
    expect(words[0]?.[2]).toBeCloseTo(1, 3);
    expect(words[0]?.[3]).toBeCloseTo(1 + 4 / 9, 3);
    expect(words[1]?.[2]).toBeCloseTo(1 + 4 / 9, 3);
    expect(words[1]?.[3]).toBeCloseTo(2, 3);
  });

  it("interpolates across the span with no tokens", () => {
    const words = alignWords("hi there", [], { t0: 5, t1: 7 });
    expect(words).toHaveLength(2);
    expect(words[0]?.[2]).toBe(5);
    expect(words[1]?.[3]).toBe(7);
  });
});

describe("activeWordAt", () => {
  const chunk = { w: [0, 2, 0.5, 1, 3, 5, 1.5, 2] };
  it("holds the highlight through the gap after a word", () => {
    expect(activeWordAt(chunk, 0.4)).toBe(-1);
    expect(activeWordAt(chunk, 0.5)).toBe(0);
    expect(activeWordAt(chunk, 1.4)).toBe(0);
    expect(activeWordAt(chunk, 1.5)).toBe(1);
    expect(activeWordAt(chunk, 99)).toBe(1);
  });
});

describe("wordAt", () => {
  const narration = {
    chunks: [
      { n: 1, start: 0, end: 8, w: [0, 2, 0.5, 1, 3, 8, 1.5, 2] },
      { n: 1, start: 9, end: 14, w: [9, 14, 2.5, 3] },
    ],
  };
  it("finds the word covering a char offset for click-to-seek", () => {
    expect(wordAt(narration, 1, 1)).toEqual({ chunk: 0, word: 0, t0: 0.5 });
    expect(wordAt(narration, 1, 4)).toEqual({ chunk: 0, word: 1, t0: 1.5 });
    expect(wordAt(narration, 1, 10)).toEqual({ chunk: 1, word: 0, t0: 2.5 });
    expect(wordAt(narration, 1, 8)).toBeNull();
    expect(wordAt(narration, 2, 1)).toBeNull();
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
