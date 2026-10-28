// Pure narration logic: sentence split, chunking, cache keys, manifest
// validation, playback helpers, and cost math. No env, no network,
// no crypto, no node: imports; callers inject hashing.
export const NARRATION_VOICE = "af_heart";
export const NARRATION_MODEL = "kokoro-82m/0.9.4";
export const NARRATION_SPEED = 0.95;
export const NARRATION_FORMAT = 1;
export const SENTENCE_GAP_SEC = 0.3;
export const PARAGRAPH_GAP_SEC = 0.7;

export interface SentenceSpan {
  start: number;
  end: number;
}

export interface NarrationChunk {
  n: number;
  start: number;
  end: number;
  text: string;
}

const CLOSERS = new Set(["”", "’", '"', "'", ")", "]"]);

// Lowercase words that end with a period without ending a sentence.
const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "st", "mt", "prof", "sr", "jr",
  "rev", "lt", "col", "gen", "capt", "sgt", "ave", "blvd", "rd", "no",
]);

function isTerminator(char: string): boolean {
  return char === "." || char === "!" || char === "?" || char === "…";
}

function isSpace(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char);
}

// Word of letters directly before index (exclusive), lowercased.
function wordBefore(text: string, index: number): string {
  let i = index - 1;
  while (i >= 0 && /[A-Za-z]/.test(text[i] as string)) i -= 1;
  return text.slice(i + 1, index).toLowerCase();
}

function wordCount(piece: string): number {
  const words = piece.split(/\s+/).filter((w) => w.length > 0);
  return words.length;
}

// Char offsets into the paragraph text, trimmed of surrounding
// whitespace, covering every non-space char. A sentence ends at a
// terminator plus closing quotes/brackets followed by whitespace.
export function splitSentences(text: string): SentenceSpan[] {
  const raw: SentenceSpan[] = [];
  let pieceStart = -1;
  let i = 0;
  while (i < text.length) {
    const char = text[i] as string;
    if (/\s/.test(char)) {
      i += 1;
      continue;
    }
    if (pieceStart === -1) pieceStart = i;
    if (isTerminator(char)) {
      let end = i + 1;
      while (end < text.length && CLOSERS.has(text[end] as string)) end += 1;
      if (isSpace(text[end])) {
        if (char === ".") {
          const word = wordBefore(text, i);
          const singleInitial = /^[A-Z]$/.test(text.slice(i - 1, i));
          if (singleInitial || ABBREVIATIONS.has(word)) {
            i += 1;
            continue;
          }
        }
        // Trim trailing whitespace inside the piece (there is none:
        // the piece ends at a terminator or closer).
        raw.push({ start: pieceStart, end });
        pieceStart = -1;
        i = end;
        continue;
      }
    }
    i += 1;
  }
  if (pieceStart !== -1) {
    let end = text.length;
    while (end > pieceStart && /\s/.test(text[end - 1] as string)) end -= 1;
    raw.push({ start: pieceStart, end });
  }
  if (raw.length === 0) return [];
  // Merge a piece shorter than 3 words into the previous sentence
  // (or the next one if first), keeping offsets exact.
  const merged: SentenceSpan[] = [];
  for (const span of raw) {
    const piece = text.slice(span.start, span.end);
    if (wordCount(piece) >= 3 || merged.length === 0) {
      merged.push({ ...span });
      continue;
    }
    const prev = merged[merged.length - 1] as SentenceSpan;
    prev.end = span.end;
  }
  if (merged.length > 1) {
    const first = merged[0] as SentenceSpan;
    if (wordCount(text.slice(first.start, first.end)) < 3) {
      const next = merged[1] as SentenceSpan;
      next.start = first.start;
      merged.shift();
    }
  }
  return merged;
}

export function chapterChunks(paragraphs: { n: number; text: string }[]): {
  chunks: NarrationChunk[];
  gaps: number[];
} {
  const chunks: NarrationChunk[] = [];
  const paraOf: number[] = [];
  paragraphs.forEach((para, paraIndex) => {
    for (const span of splitSentences(para.text)) {
      chunks.push({ n: para.n, start: span.start, end: span.end, text: para.text.slice(span.start, span.end) });
      paraOf.push(paraIndex);
    }
  });
  const gaps = chunks.map((_, i) => {
    if (i === chunks.length - 1) return 0;
    return paraOf[i] !== paraOf[i + 1] ? PARAGRAPH_GAP_SEC : SENTENCE_GAP_SEC;
  });
  return { chunks, gaps };
}

export function normalizeChunkText(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

// Canonical string the caller hashes with SHA-256. Same text + voice +
// model + speed => same string; any edit changes it.
export function narrationKeyInput(args: {
  chunks: { text: string }[];
  voice: string;
  model: string;
  speed: number;
  format: number;
}): string {
  const body = args.chunks.map((c) => normalizeChunkText(c.text)).join("\n");
  return `narration/${args.format}\nvoice:${args.voice}\nmodel:${args.model}\nspeed:${args.speed}\n${body}`;
}

export function narrationKey(hashHex: string, voice: string): string {
  return `narration/v${NARRATION_FORMAT}/${voice}/${hashHex.slice(0, 32)}`;
}

export function narrationAudioPath(key: string): string {
  return `${key}.mp3`;
}

export function narrationManifestPath(key: string): string {
  return `${key}.json`;
}

export interface ChapterChunkTiming {
  n: number;
  start: number;
  end: number;
  t0: number;
  t1: number;
}

export interface ChapterNarration {
  format: 1;
  key: string;
  src: string;
  durationSec: number;
  voice: string;
  model: string;
  speed: number;
  chunks: ChapterChunkTiming[];
}

function isRecord(json: unknown): json is Record<string, unknown> {
  return typeof json === "object" && json !== null && !Array.isArray(json);
}

// Strict parse at the trust boundary: the reader fetches this JSON,
// so any bad field throws instead of half-playing.
export function parseChapterNarration(json: unknown): ChapterNarration {
  if (!isRecord(json)) throw new Error("invalid narration manifest");
  if (json.format !== NARRATION_FORMAT) throw new Error("invalid narration manifest");
  if (typeof json.key !== "string" || json.key.length === 0) throw new Error("invalid narration manifest");
  if (typeof json.src !== "string" || !isSafeSrc(json.src)) throw new Error("invalid narration manifest");
  if (typeof json.durationSec !== "number" || !Number.isFinite(json.durationSec) || json.durationSec <= 0) {
    throw new Error("invalid narration manifest");
  }
  if (typeof json.voice !== "string" || json.voice.length === 0) throw new Error("invalid narration manifest");
  if (typeof json.model !== "string" || json.model.length === 0) throw new Error("invalid narration manifest");
  if (typeof json.speed !== "number" || !Number.isFinite(json.speed)) throw new Error("invalid narration manifest");
  if (!Array.isArray(json.chunks) || json.chunks.length === 0) throw new Error("invalid narration manifest");
  const chunks: ChapterChunkTiming[] = json.chunks.map((entry) => {
    if (!isRecord(entry)) throw new Error("invalid narration manifest");
    const { n, start, end, t0, t1 } = entry;
    if (typeof n !== "number" || !Number.isInteger(n)) throw new Error("invalid narration manifest");
    if (typeof start !== "number" || !Number.isInteger(start) || start < 0) throw new Error("invalid narration manifest");
    if (typeof end !== "number" || !Number.isInteger(end) || end <= start) throw new Error("invalid narration manifest");
    for (const t of [t0, t1]) {
      if (typeof t !== "number" || !Number.isFinite(t)) throw new Error("invalid narration manifest");
    }
    const from = t0 as number;
    const to = t1 as number;
    if (!(0 <= from && from < to && to <= (json.durationSec as number) + 0.05)) {
      throw new Error("invalid narration manifest");
    }
    return { n: n as number, start: start as number, end: end as number, t0: from, t1: to };
  });
  for (let i = 1; i < chunks.length; i++) {
    if ((chunks[i] as ChapterChunkTiming).t0 < (chunks[i - 1] as ChapterChunkTiming).t0) {
      throw new Error("invalid narration manifest");
    }
  }
  return {
    format: 1,
    key: json.key as string,
    src: json.src as string,
    durationSec: json.durationSec as number,
    voice: json.voice as string,
    model: json.model as string,
    speed: json.speed as number,
    chunks,
  };
}

function isSafeSrc(src: string): boolean {
  if (src.startsWith("/narration/")) return true;
  if (src.startsWith("https://")) {
    try {
      new URL(src);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

// Binary search: index of the last chunk with t0 <= t, so the highlight
// stays on a sentence through the gap after it. -1 before the first.
export function activeChunkAt(chunks: { t0: number }[], tSec: number): number {
  let lo = 0;
  let hi = chunks.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((chunks[mid] as { t0: number }).t0 <= tSec) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

// Playback range for a scene: t0 of the first chunk with n >= startN
// through t1 of the last chunk with n <= endN. Null when empty.
export function sceneSpan(
  narration: { chunks: { n: number; t0: number; t1: number }[] },
  startN: number,
  endN: number,
): { startSec: number; endSec: number } | null {
  let startSec: number | null = null;
  let endSec: number | null = null;
  for (const chunk of narration.chunks) {
    if (chunk.n < startN || chunk.n > endN) continue;
    if (startSec === null) startSec = chunk.t0;
    endSec = chunk.t1;
  }
  if (startSec === null || endSec === null) return null;
  return { startSec, endSec };
}

export type PrepareEvent = "upload" | "enter" | "jump";

// Owner's rolling window: upload warms chapters 1-2 while the book is
// processed; entering N warms N+1 and N+2; jumping to N warms N and N+1.
export function chaptersToPrepare(event: PrepareEvent, ch: number, totalChapters: number): number[] {
  const wanted = event === "upload" ? [1, 2] : event === "enter" ? [ch + 1, ch + 2] : [ch, ch + 1];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const n of wanted) {
    if (n < 1 || n > totalChapters || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

// Modal L4, about USD 0.80/h.
export const KOKORO_L4_USD_PER_SEC = 0.000222;

// About 15 chars of audio per second, GPU time about 2% of audio after
// encode, plus 8 s of cold start/overhead. Integer micro-dollars.
export function estimateNarrationMicro(chars: number): number {
  return Math.ceil((Math.max(0, chars) / 15 * 0.02 + 8) * KOKORO_L4_USD_PER_SEC * 1e6);
}

export function actualNarrationMicro(gpuSec: number): number {
  return Math.ceil(Math.max(0, gpuSec) * KOKORO_L4_USD_PER_SEC * 1e6);
}
