// Cleaning rules 1-11: pure section filters, title derivation, tail cuts.
// No env reads, no network. clean.ts orchestrates these and the judge.
import type { CleanReport, RawSection, RemovedItem } from "./clean-types";

export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

export function sectionWords(sec: Pick<RawSection, "blocks">): number {
  return sec.blocks.reduce((n, b) => n + countWords(b.text), 0);
}

export function short(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max);
}

export function removedFor(
  sec: RawSection,
  rule: string,
  kind: string,
  reason: string,
  blockRange: [number, number] | null = null,
): RemovedItem {
  const texts =
    blockRange === null ? sec.blocks.map((b) => b.text) : sec.blocks.slice(blockRange[0], blockRange[1] + 1).map((b) => b.text);
  return {
    sectionId: sec.id,
    blockRange,
    kind,
    reason: short(reason, 120),
    rule,
    words: texts.reduce((n, t) => n + countWords(t), 0),
    preview: short(texts[0] ?? "", 120),
  };
}

// Rule 1: spine items outside the linear reading order are never content.
function ruleLinearNo(sec: RawSection): { kind: string; reason: string } | null {
  return sec.linear ? null : { kind: "non_content", reason: 'linear="no" spine item' };
}

// Rule 2: Standard Ebooks types are exact. Keep chapters and bodymatter,
// drop front/backmatter. Gutenberg files carry no types and pass through.
export function ruleEpubType(sec: RawSection): { kind: string; reason: string } | null {
  const types = sec.types.map((t) => t.toLowerCase());
  if (types.includes("chapter") || types.includes("bodymatter")) return null;
  if (types.includes("frontmatter") || types.includes("backmatter")) {
    return { kind: "front_matter", reason: `epub:type ${sec.types.join(" ")}` };
  }
  return null;
}

// Rule 8 (runs early): a heading-free fragment of at most 30 words whose
// docTitle matches the previous kept section continues that section. Runs
// before empty/keyword rules so "Holmesly." merges instead of vanishing.
export function mergeContinuations(
  sections: RawSection[],
  merged: CleanReport["merged"],
): RawSection[] {
  const kept: RawSection[] = [];
  for (const sec of sections) {
    const prev = kept[kept.length - 1];
    if (
      prev !== undefined &&
      sec.docTitle !== null &&
      sec.docTitle === prev.docTitle &&
      sec.blocks.every((b) => !b.heading) &&
      sectionWords(sec) <= 30
    ) {
      kept[kept.length - 1] = { ...prev, blocks: [...prev.blocks, ...sec.blocks] };
      merged.push({ from: sec.id, into: prev.id, reason: `no headings, ${sectionWords(sec)} words, same docTitle` });
    } else {
      kept.push(sec);
    }
  }
  return kept;
}

// Rule 3: zero words, or nothing but headings (title pages, license shells).
export function ruleEmpty(sec: RawSection): { kind: string; reason: string } | null {
  if (sectionWords(sec) === 0) return { kind: "empty", reason: "no words" };
  if (sec.blocks.length > 0 && sec.blocks.every((b) => b.heading)) {
    return { kind: "empty", reason: "heading-only blocks" };
  }
  return null;
}

// Rule 4: Gutenberg wrapper sections. The docTitle decides; the nav label
// counts only when there is no docTitle, because several nav entries can
// point at one file (the license entry may share the last chapter file).
// A confident chapter heading or a long non-marker body never matches, so
// a story chapter keeps its pages even with a license-flavored nav label.
function markerKind(text: string): { kind: string; reason: string } | null {
  if (text.toLowerCase().includes("project gutenberg")) return { kind: "boilerplate", reason: "gutenberg wrapper" };
  if (/\blicense\b/i.test(text)) return { kind: "license", reason: "license section" };
  if (/\bcover\b/i.test(text)) return { kind: "front_matter", reason: "cover section" };
  return null;
}

function nonMarkerWords(sec: RawSection): number {
  return sec.blocks
    .filter((b) => markerKind(b.text) === null)
    .reduce((n, b) => n + countWords(b.text), 0);
}

export function rulePgMarkers(sec: RawSection): { kind: string; reason: string } | null {
  const docHit = sec.docTitle === null ? null : markerKind(sec.docTitle);
  const navHit = sec.docTitle === null && sec.navLabel !== null ? markerKind(sec.navLabel) : null;
  const hit = docHit ?? navHit;
  if (hit === null) return null;
  if (isConfident(sec)) return null;
  if (nonMarkerWords(sec) > 300) return null;
  return hit;
}

const TITLE_TERMS: { term: string; kind: string }[] = [
  { term: "contents", kind: "contents" },
  { term: "transcriber's note", kind: "transcriber_note" },
  { term: "transcriber’s note", kind: "transcriber_note" },
  { term: "advertisements", kind: "advertisement" },
  { term: "advertisement", kind: "advertisement" },
  { term: "also by", kind: "advertisement" },
  { term: "colophon", kind: "colophon" },
  { term: "copyright", kind: "copyright" },
  { term: "index", kind: "front_matter" },
  { term: "about the author", kind: "about_author" },
  { term: "preface", kind: "front_matter" },
  { term: "introduction", kind: "front_matter" },
  { term: "foreword", kind: "front_matter" },
  { term: "prefatory note", kind: "front_matter" },
  { term: "title page", kind: "front_matter" },
  { term: "titlepage", kind: "front_matter" },
  { term: "half-title", kind: "front_matter" },
  { term: "halftitle", kind: "front_matter" },
  { term: "imprint", kind: "front_matter" },
  { term: "dedication", kind: "front_matter" },
  { term: "license", kind: "license" },
];

function matchTitleTerm(guess: string): { kind: string; reason: string } | null {
  const g = guess.toLowerCase().trim();
  for (const { term, kind } of TITLE_TERMS) {
    if (g === term || g.startsWith(term)) return { kind, reason: `title matches "${term}"` };
  }
  return null;
}

// First heading that is not the book title. A bare label ("Stave I")
// defers to the nav label after the colon; with no headings the docTitle
// (then nav label) is the guess.
export function deriveTitle(sec: Pick<RawSection, "blocks" | "docTitle" | "navLabel">, bookTitle: string): string {
  const heads = sec.blocks.filter((b) => b.heading).map((b) => b.text.trim());
  const first = heads.find((h) => h.toLowerCase() !== bookTitle.toLowerCase());
  if (first === undefined) return sec.docTitle ?? sec.navLabel ?? "Untitled";
  const stripped = first
    .replace(/^(?:chapter|stave|book|part)\s+[ivxlc0-9]+[.:]?\s*/i, "")
    .replace(/^(?:[ivxlc]+|\d+)[.:]?\s+/i, "")
    .trim();
  if (stripped.length > 0) return stripped;
  if (sec.navLabel !== null) {
    const colon = sec.navLabel.indexOf(":");
    if (colon !== -1 && sec.navLabel.slice(colon + 1).trim().length > 0) {
      return sec.navLabel.slice(colon + 1).trim();
    }
  }
  return sec.docTitle ?? sec.navLabel ?? "Untitled";
}

// Rule 5: front-matter titles. Besides the guess, a bare heading such as
// "Contents" on a title page drops the section.
export function ruleTitlePolicy(bookTitle: string) {
  return (sec: RawSection): { kind: string; reason: string } | null => {
    const hit = matchTitleTerm(deriveTitle(sec, bookTitle));
    if (hit !== null) {
      // A title guessed from the nav label (no headings, no docTitle) gets
      // the pg-markers guard: a long story body keeps its chapter.
      const viaNav = sec.docTitle === null && sec.navLabel !== null && !sec.blocks.some((b) => b.heading);
      if (viaNav && (isConfident(sec) || nonMarkerWords(sec) > 300)) return null;
      return hit;
    }
    const heads = sec.blocks.filter((b) => b.heading).map((b) => b.text.toLowerCase().trim());
    for (const { term, kind } of TITLE_TERMS) {
      if (heads.includes(term)) return { kind, reason: `heading matches "${term}"` };
    }
    return null;
  };
}

// Case- and punctuation-insensitive title compare for contents lists and
// duplicate title blocks.
function normalizeTitle(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Rule 6: contents tables are mostly short entries plus page numbers, or a
// cross-reference list of the book's own chapter titles (pg54 h-0): at
// least 3 non-empty blocks, at least half, equal other sections' derived
// titles or first headings.
export function ruleContentsBody(bookTitle: string, sections: RawSection[]) {
  const titles = new Set<string>();
  for (const sec of sections) {
    titles.add(normalizeTitle(deriveTitle(sec, bookTitle)));
    const firstHead = sec.blocks.find((b) => b.heading);
    if (firstHead !== undefined) titles.add(normalizeTitle(firstHead.text));
  }
  titles.delete("");
  return (sec: RawSection): { kind: string; reason: string } | null => {
    const body = sec.blocks.filter((b) => !b.heading);
    if (body.length > 0) {
      const shortCount = body.filter((b) => countWords(b.text) < 6).length;
      const numbers = body.filter((b) => /^\d+$/.test(b.text.trim())).length;
      if (shortCount / body.length >= 0.6 && numbers >= 3) {
        return { kind: "contents", reason: "mostly short entries with page numbers" };
      }
    }
    const nonEmpty = sec.blocks.filter((b) => b.text.trim().length > 0);
    if (nonEmpty.length === 0) return null;
    const mine = new Set([normalizeTitle(deriveTitle(sec, bookTitle))]);
    const firstHead = sec.blocks.find((b) => b.heading);
    if (firstHead !== undefined) mine.add(normalizeTitle(firstHead.text));
    const hits = nonEmpty.filter((b) => {
      const text = normalizeTitle(b.text);
      return text.length > 0 && titles.has(text) && !mine.has(text);
    }).length;
    if (hits >= 3 && hits / nonEmpty.length >= 0.5) {
      return { kind: "contents", reason: "lists other sections' titles" };
    }
    return null;
  };
}

function isAdBlock(text: string): boolean {
  const t = text.trim();
  if (/\b\d+\s*s\./.test(t)) return true; // 6s., 3s. 6d.
  if (/\b\d+\s*s\.(?:\s*\d+\s*d\.)?\s*net\b/i.test(t)) return true; // 6s. net
  if (/^\s*net\s*\.?\s*$/i.test(t)) return true; // a whole block reading net
  if (/crown\s+8vo/i.test(t)) return true;
  if (/in\s+one\s+volume/i.test(t)) return true;
  if (/\bprice\b/i.test(t)) return true;
  if (/[—–]\s*[“"]/.test(t)) return true; // GLOBE.—"quote"
  if (/·|\bmacmillan\b|\blondon\b/i.test(t)) return true; // publisher address
  return false;
}

// Rule 7: publisher ad bodies. `net` counts only price-adjacent or
// whole-block, never a bare word in prose.
export function ruleAdBody(sec: RawSection): { kind: string; reason: string } | null {
  if (sec.blocks.length === 0) return null;
  const hits = sec.blocks.filter((b) => isAdBlock(b.text)).length;
  if (hits / sec.blocks.length >= 0.3) {
    return { kind: "advertisement", reason: `${hits} of ${sec.blocks.length} blocks match ad tokens` };
  }
  return null;
}

const CHAPTER_LABEL = /^(?:chapter|stave|book|part)\s+[ivxlc0-9]+[.:]?\b/i;
const BARE_NUMERAL = /^(?:[ivxlc]+|\d+)[.:]?$/i;

// Rule 9: confident content skips keyword rules 5-7 and the LLM.
export function isConfident(sec: RawSection): boolean {
  const heads = sec.blocks.filter((b) => b.heading).map((b) => b.text.trim());
  if (heads.some((h) => CHAPTER_LABEL.test(h))) return true;
  if (sec.navLabel !== null && sec.navLabel.includes(":")) {
    if (heads.some((h) => BARE_NUMERAL.test(h))) return true;
  }
  return false;
}

const END_MARK = /^(THE END|FINIS)\.?$/i;
const PRINTER_PATTERNS = [
  /^printed\s+(by|in)\b/i,
  /&\s*sons,?\s+limited/i,
  /r\.\s*&\s*r\.\s*clark/i,
  /limited,?\s+(london|edinburgh)\b/i,
];

// Suffix length of the last kept section that rule 10 removes right after
// the judge runs: trailing printer lines, everything after THE END/FINIS,
// or the whole section when it sits past the END mark with no confident
// section after it.
export function deterministicTailOverlap(kept: RawSection[], lastIdx: number): number {
  const last = kept[lastIdx];
  if (last === undefined) return 0;
  const { endSec, endIdx } = findEndMark(kept);
  if (endSec !== -1 && lastIdx > endSec && !kept.slice(endSec + 1).some(isConfident)) {
    return last.blocks.length;
  }
  let overlap = 0;
  while (
    overlap < last.blocks.length &&
    PRINTER_PATTERNS.some((p) => p.test(last.blocks[last.blocks.length - 1 - overlap]?.text.trim() ?? ""))
  ) {
    overlap += 1;
  }
  if (endSec === lastIdx && endIdx < last.blocks.length - 1) {
    overlap = Math.max(overlap, last.blocks.length - 1 - endIdx);
  }
  return overlap;
}

// Last THE END/FINIS mark across kept sections, if any.
function findEndMark(kept: RawSection[]): { endSec: number; endIdx: number } {
  let endSec = -1;
  let endIdx = -1;
  kept.forEach((sec, i) => {
    const idx = sec.blocks.map((b) => b.text.trim()).findLastIndex((t) => END_MARK.test(t));
    if (idx !== -1) {
      endSec = i;
      endIdx = idx;
    }
  });
  return { endSec, endIdx };
}

// Rule 10: cut everything after the last THE END/FINIS mark in any kept
// section (Cottage Folk hides it mid-file with ad pages below), and drop
// every later section, unless a later section carries a confident chapter
// heading. Trailing printer lines go separately in every kept section.
// Printer lines hide mid-list too (a merged "Sussex." + printer line lands
// in a story the ad sections below used to follow). Sign-offs stay.
export function applyTailCut(kept: RawSection[], removed: RemovedItem[]): RawSection[] {
  const { endSec, endIdx } = findEndMark(kept);
  if (endSec === -1) return kept;
  const endSection = kept[endSec];
  if (endSection === undefined) return kept;
  const out = kept.slice(0, endSec + 1);
  if (endIdx < endSection.blocks.length - 1) {
    removed.push(removedFor(endSection, "tail-cut", "back_matter", "after THE END", [endIdx + 1, endSection.blocks.length - 1]));
    out[endSec] = { ...endSection, blocks: endSection.blocks.slice(0, endIdx + 1) };
  }
  const later = kept.slice(endSec + 1);
  if (later.some(isConfident)) return [...out, ...later];
  for (const sec of later) {
    removed.push(removedFor(sec, "tail-cut", "back_matter", "after THE END"));
  }
  return out;
}

export function stripPrinterLines(sec: RawSection, removed: RemovedItem[]): RawSection {
  let end = sec.blocks.length;
  while (end > 0 && PRINTER_PATTERNS.some((p) => p.test(sec.blocks[end - 1]?.text.trim() ?? ""))) {
    end -= 1;
  }
  if (end === sec.blocks.length) return sec;
  removed.push(removedFor(sec, "tail-cut", "back_matter", "printer line", [end, sec.blocks.length - 1]));
  return { ...sec, blocks: sec.blocks.slice(0, end) };
}

const IMAGE_PLACEHOLDER = /^(image|img|illus|illustration|fig)[ _-]?\d+[a-z]?$/i;

// Rule 11: inside content, drop headings, illustration and image
// placeholders, Gutenberg page anchors, and a repeated chapter title in
// the first two body blocks (Cottage Folk "THE HOPPERS"). Oz chapters
// start with prose, so the duplicate-title drop never fires there.
export function toParagraphs(sec: RawSection, title: string): string[] {
  const normTitle = normalizeTitle(title);
  const body = sec.blocks.filter((b) => !b.heading);
  let skip = 0;
  if (normTitle.length > 0 && sec.blocks.some((b) => b.heading)) {
    for (const b of body.slice(0, 2)) {
      if (normalizeTitle(b.text) === normTitle) skip += 1;
      else break;
    }
  }
  return body
    .slice(skip)
    .filter(
      (b) =>
        !/^\[illustration/i.test(b.text.trim()) &&
        !IMAGE_PLACEHOLDER.test(b.text.trim()) &&
        !/^\[pg\s*\d+\]$/i.test(b.text.trim()),
    )
    .map((b) => b.text);
}
