// Cleaning: strip front/back junk before segmentation. Pure: no env reads,
// no network. The LLM arrives as an injected judge; tests pass fakes.

export interface RawBlock {
  text: string;
  heading: boolean;
}

export interface RawSection {
  id: string;
  href: string;
  linear: boolean;
  types: string[];
  docTitle: string | null;
  navLabel: string | null;
  blocks: RawBlock[];
}

export interface JudgeSectionInput {
  id: string;
  title: string;
  words: number;
  head: string[];
  tail: string[];
}

export interface JudgeWindowBlock {
  index: number;
  text: string;
}

export interface JudgeInput {
  sections: JudgeSectionInput[];
  headWindow: JudgeWindowBlock[];
  tailWindow: JudgeWindowBlock[];
}

export type JudgeVerdictLabel = "content" | "non_content" | "uncertain";

export interface JudgeVerdict {
  id: string;
  verdict: JudgeVerdictLabel;
  kind: string;
  reason: string;
}

export interface JudgeResult {
  sections: JudgeVerdict[];
  headCut: number;
  tailCut: number;
  model: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  costUsd: number;
}

export type Judge = (input: JudgeInput) => Promise<JudgeResult | null>;

export interface CleanChapter {
  title: string;
  paragraphs: string[];
  sectionIds: string[];
}

export interface RemovedItem {
  sectionId: string;
  blockRange: [number, number] | null;
  kind: string;
  reason: string;
  rule: string;
  words: number;
  preview: string;
}

export interface CleanReport {
  source: "epub" | "gutenberg-txt";
  llm: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    cachedTokens: number;
    costUsd: number;
    error?: string;
  } | null;
  kept: { title: string; paragraphs: number; sectionIds: string[] }[];
  removed: RemovedItem[];
  flagged: { sectionId: string; reason: string }[];
  merged: { from: string; into: string; reason: string }[];
}

const HEAD_WINDOW = 6;
const TAIL_WINDOW = 8;
const LONG_SECTION_WORDS = 2000;

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

function sectionWords(sec: Pick<RawSection, "blocks">): number {
  return sec.blocks.reduce((n, b) => n + countWords(b.text), 0);
}

function short(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max);
}

function removedFor(
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
function ruleEpubType(sec: RawSection): { kind: string; reason: string } | null {
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
function mergeContinuations(
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
function ruleEmpty(sec: RawSection): { kind: string; reason: string } | null {
  if (sectionWords(sec) === 0) return { kind: "empty", reason: "no words" };
  if (sec.blocks.length > 0 && sec.blocks.every((b) => b.heading)) {
    return { kind: "empty", reason: "heading-only blocks" };
  }
  return null;
}

// Rule 4: Gutenberg wrapper sections by docTitle or nav label.
function rulePgMarkers(sec: RawSection): { kind: string; reason: string } | null {
  const hay = `${sec.docTitle ?? ""} ${sec.navLabel ?? ""}`.toLowerCase();
  if (hay.includes("project gutenberg")) return { kind: "boilerplate", reason: "gutenberg wrapper" };
  if (/\blicense\b/.test(hay)) return { kind: "license", reason: "license section" };
  if (/\bcover\b/.test(hay)) return { kind: "front_matter", reason: "cover section" };
  return null;
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
function ruleTitlePolicy(bookTitle: string) {
  return (sec: RawSection): { kind: string; reason: string } | null => {
    const hit = matchTitleTerm(deriveTitle(sec, bookTitle));
    if (hit !== null) return hit;
    const heads = sec.blocks.filter((b) => b.heading).map((b) => b.text.toLowerCase().trim());
    for (const { term, kind } of TITLE_TERMS) {
      if (heads.includes(term)) return { kind, reason: `heading matches "${term}"` };
    }
    return null;
  };
}

// Rule 6: contents tables are mostly short entries plus page numbers.
function ruleContentsBody(sec: RawSection): { kind: string; reason: string } | null {
  const body = sec.blocks.filter((b) => !b.heading);
  if (body.length === 0) return null;
  const shortCount = body.filter((b) => countWords(b.text) < 6).length;
  const numbers = body.filter((b) => /^\d+$/.test(b.text.trim())).length;
  if (shortCount / body.length >= 0.6 && numbers >= 3) {
    return { kind: "contents", reason: "mostly short entries with page numbers" };
  }
  return null;
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
function ruleAdBody(sec: RawSection): { kind: string; reason: string } | null {
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
function isConfident(sec: RawSection): boolean {
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

// Rule 10: cut everything after THE END/FINIS in the last kept section,
// and drop trailing printer lines only, in every kept section. Printer
// lines hide mid-list too (a merged "Sussex." + printer line lands in a
// story the ad sections below used to follow). Sign-offs stay.
function truncateAfterEnd(sec: RawSection, removed: RemovedItem[]): RawSection {
  const endIdx = sec.blocks.map((b) => b.text.trim()).findLastIndex((t) => END_MARK.test(t));
  if (endIdx === -1 || endIdx === sec.blocks.length - 1) return sec;
  removed.push(removedFor(sec, "tail-cut", "back_matter", "after THE END", [endIdx + 1, sec.blocks.length - 1]));
  return { ...sec, blocks: sec.blocks.slice(0, endIdx + 1) };
}

function stripPrinterLines(sec: RawSection, removed: RemovedItem[]): RawSection {
  let end = sec.blocks.length;
  while (end > 0 && PRINTER_PATTERNS.some((p) => p.test(sec.blocks[end - 1]?.text.trim() ?? ""))) {
    end -= 1;
  }
  if (end === sec.blocks.length) return sec;
  removed.push(removedFor(sec, "tail-cut", "back_matter", "printer line", [end, sec.blocks.length - 1]));
  return { ...sec, blocks: sec.blocks.slice(0, end) };
}

// Rule 11: inside content, drop headings, illustration placeholders,
// and Gutenberg page anchors.
function toParagraphs(sec: RawSection): string[] {
  return sec.blocks
    .filter((b) => !b.heading && !/^\[illustration/i.test(b.text.trim()) && !/^\[pg\s*\d+\]$/i.test(b.text.trim()))
    .map((b) => b.text);
}

function buildJudgeInput(kept: RawSection[], ambiguous: RawSection[], bookTitle: string): JudgeInput {
  const first = kept[0];
  const last = kept[kept.length - 1];
  return {
    sections: ambiguous.map((sec) => ({
      id: sec.id,
      title: deriveTitle(sec, bookTitle),
      words: sectionWords(sec),
      head: sec.blocks.slice(0, 2).map((b) => short(b.text, 200)),
      tail: sec.blocks.slice(-2).map((b) => short(b.text, 200)),
    })),
    headWindow: (first?.blocks.slice(0, HEAD_WINDOW) ?? []).map((b, index) => ({ index, text: short(b.text, 200) })),
    tailWindow: (last?.blocks.slice(-TAIL_WINDOW) ?? []).map((b, index) => ({ index, text: short(b.text, 200) })),
  };
}

export async function cleanSections(
  bookTitle: string,
  sections: RawSection[],
  judge?: Judge,
): Promise<{ chapters: CleanChapter[]; report: CleanReport }> {
  const removed: RemovedItem[] = [];
  const flagged: CleanReport["flagged"] = [];
  const merged: CleanReport["merged"] = [];
  const pushRemoved = (sec: RawSection, rule: string, kind: string, reason: string): void => {
    removed.push(removedFor(sec, rule, kind, reason));
  };

  let kept = sections.filter((sec) => {
    if (!sec.linear) {
      pushRemoved(sec, "linear-no", "non_content", 'linear="no" spine item');
      return false;
    }
    return true;
  });
  kept = kept.filter((sec) => {
    const hit = ruleEpubType(sec);
    if (hit !== null) {
      pushRemoved(sec, "epub-type", hit.kind, hit.reason);
      return false;
    }
    return true;
  });
  kept = mergeContinuations(kept, merged);
  const dropSimple = (rule: (sec: RawSection) => { kind: string; reason: string } | null, name: string): void => {
    kept = kept.filter((sec) => {
      const hit = rule(sec);
      if (hit !== null) {
        pushRemoved(sec, name, hit.kind, hit.reason);
        return false;
      }
      return true;
    });
  };
  dropSimple(ruleEmpty, "empty");
  dropSimple(rulePgMarkers, "pg-markers");
  const confident = new Set(kept.filter(isConfident).map((sec) => sec.id));
  const skipConfident = (
    rule: (sec: RawSection) => { kind: string; reason: string } | null,
    name: string,
  ): void => {
    kept = kept.filter((sec) => {
      if (confident.has(sec.id)) return true;
      const hit = rule(sec);
      if (hit !== null) {
        pushRemoved(sec, name, hit.kind, hit.reason);
        return false;
      }
      return true;
    });
  };
  skipConfident(ruleTitlePolicy(bookTitle), "title-policy");
  skipConfident(ruleContentsBody, "contents-body");
  skipConfident(ruleAdBody, "ad-body");

  let llm: CleanReport["llm"] = null;
  const ambiguous = kept.filter((sec) => !confident.has(sec.id));
  if (ambiguous.length > 0 && judge !== undefined) {
    let result: JudgeResult | null = null;
    try {
      result = await judge(buildJudgeInput(kept, ambiguous, bookTitle));
    } catch {
      result = null;
    }
    if (result === null) {
      llm = { model: "unknown", promptTokens: 0, completionTokens: 0, cachedTokens: 0, costUsd: 0, error: "failed" };
    } else {
      llm = {
        model: result.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        cachedTokens: result.cachedTokens,
        costUsd: result.costUsd,
      };
      const byId = new Map(result.sections.map((v) => [v.id, v]));
      const contentIds = new Set(
        ambiguous.filter((sec) => byId.get(sec.id)?.verdict === "content" || confident.has(sec.id)).map((sec) => sec.id),
      );
      for (const c of kept) if (confident.has(c.id)) contentIds.add(c.id);
      const after: RawSection[] = [];
      ambiguous.forEach((sec) => {
        const verdict = byId.get(sec.id);
        if (verdict === undefined || verdict.verdict === "content") {
          after.push(sec);
          return;
        }
        if (verdict.verdict === "uncertain") {
          flagged.push({ sectionId: sec.id, reason: short(verdict.reason, 120) });
          after.push(sec);
          return;
        }
        const at = kept.indexOf(sec);
        const before = kept.slice(0, at).some((s) => contentIds.has(s.id));
        const behind = kept.slice(at + 1).some((s) => contentIds.has(s.id));
        if (sectionWords(sec) >= LONG_SECTION_WORDS && before && behind) {
          flagged.push({ sectionId: sec.id, reason: short(`long interior section kept despite verdict: ${verdict.reason}`, 120) });
          after.push(sec);
          return;
        }
        pushRemoved(sec, "llm", verdict.kind, verdict.reason);
      });
      const keptIds = new Set(after.map((s) => s.id).concat([...confident]));
      kept = kept.filter((sec) => confident.has(sec.id) || keptIds.has(sec.id));
      const headCut = Math.max(0, Math.min(Math.floor(result.headCut), HEAD_WINDOW));
      const tailCut = Math.max(0, Math.min(Math.floor(result.tailCut), TAIL_WINDOW));
      if (kept.length > 0 && headCut > 0) {
        const firstKept = kept[0];
        if (firstKept !== undefined) {
          const cut = Math.min(headCut, firstKept.blocks.length);
          if (cut > 0) {
            removed.push(removedFor(firstKept, "llm", "edge_trim", "judge headCut", [0, cut - 1]));
            kept = [{ ...firstKept, blocks: firstKept.blocks.slice(cut) }, ...kept.slice(1)];
          }
        }
      }
      if (kept.length > 0 && tailCut > 0) {
        const lastKept = kept[kept.length - 1];
        if (lastKept !== undefined) {
          const cut = Math.min(tailCut, lastKept.blocks.length);
          if (cut > 0) {
            removed.push(
              removedFor(lastKept, "llm", "edge_trim", "judge tailCut", [lastKept.blocks.length - cut, lastKept.blocks.length - 1]),
            );
            kept = [...kept.slice(0, -1), { ...lastKept, blocks: lastKept.blocks.slice(0, lastKept.blocks.length - cut) }];
          }
        }
      }
    }
  }

  kept = kept.map((sec) => stripPrinterLines(sec, removed));
  if (kept.length > 0) {
    const last = kept[kept.length - 1];
    if (last !== undefined) kept = [...kept.slice(0, -1), truncateAfterEnd(last, removed)];
  }
  const chapters: CleanChapter[] = [];
  for (const sec of kept) {
    const paragraphs = toParagraphs(sec);
    if (paragraphs.length === 0) {
      pushRemoved(sec, "block-drop", "empty", "no paragraphs after block drop");
      continue;
    }
    chapters.push({ title: deriveTitle(sec, bookTitle), paragraphs, sectionIds: [sec.id] });
  }
  return {
    chapters,
    report: {
      source: "epub",
      llm,
      kept: chapters.map((c) => ({ title: c.title, paragraphs: c.paragraphs.length, sectionIds: c.sectionIds })),
      removed,
      flagged,
      merged,
    },
  };
}

export { cleanGutenbergText } from "./clean-txt";
