// Cleaning: strip front/back junk before segmentation. Pure: no env reads,
// no network. The LLM arrives as an injected judge; tests pass fakes.
// Rules live in clean-rules.ts, shared types in clean-types.ts.
export type {
  CleanChapter,
  CleanReport,
  Judge,
  JudgeInput,
  JudgeResult,
  JudgeSectionInput,
  JudgeVerdict,
  JudgeVerdictLabel,
  JudgeWindowBlock,
  RawBlock,
  RawSection,
  RemovedItem,
} from "./clean-types";
import type {
  CleanChapter,
  CleanReport,
  Judge,
  JudgeInput,
  JudgeResult,
  RawSection,
  RemovedItem,
} from "./clean-types";
import {
  applyTailCut,
  deriveTitle,
  deterministicTailOverlap,
  isConfident,
  mergeContinuations,
  removedFor,
  ruleAdBody,
  ruleContentsBody,
  ruleEditionLine,
  ruleEmpty,
  ruleEpubType,
  rulePgMarkers,
  ruleTitlePolicy,
  sectionWords,
  short,
  stripPrinterLines,
  toParagraphs,
} from "./clean-rules";
export { deriveTitle } from "./clean-rules";

const HEAD_WINDOW = 6;
const TAIL_WINDOW = 8;
const LONG_SECTION_WORDS = 2000;

interface DeterministicState {
  kept: RawSection[];
  confident: Set<string>;
  removed: RemovedItem[];
  flagged: CleanReport["flagged"];
  merged: CleanReport["merged"];
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

function deterministicFilter(bookTitle: string, sections: RawSection[]): DeterministicState {
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
  skipConfident(ruleContentsBody(bookTitle, kept), "contents-body");
  skipConfident(ruleAdBody, "ad-body");
  skipConfident(ruleEditionLine, "edition-line");
  return { kept, confident, removed, flagged, merged };
}

function finishBook(
  bookTitle: string,
  state: DeterministicState,
  llm: CleanReport["llm"],
): { chapters: CleanChapter[]; report: CleanReport } {
  const { removed, flagged, merged } = state;
  let kept = state.kept;
  const pushRemoved = (sec: RawSection, rule: string, kind: string, reason: string): void => {
    removed.push(removedFor(sec, rule, kind, reason));
  };

  kept = kept.map((sec) => stripPrinterLines(sec, removed));
  kept = applyTailCut(kept, removed);
  const chapters: CleanChapter[] = [];
  for (const sec of kept) {
    const title = deriveTitle(sec, bookTitle);
    const paragraphs = toParagraphs(sec, title);
    if (paragraphs.length === 0) {
      pushRemoved(sec, "block-drop", "empty", "no paragraphs after block drop");
      continue;
    }
    chapters.push({ title, paragraphs, sectionIds: [sec.id] });
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

// Sync deterministic pass for the browser: no judge, ambiguous sections
// stay kept. Returns the ambiguous section ids so callers can see what a
// judge would still review.
export function cleanDeterministic(
  bookTitle: string,
  sections: RawSection[],
): { chapters: CleanChapter[]; report: CleanReport; ambiguousIds: string[] } {
  const state = deterministicFilter(bookTitle, sections);
  const ambiguousIds = state.kept.filter((sec) => !state.confident.has(sec.id)).map((sec) => sec.id);
  const { chapters, report } = finishBook(bookTitle, state, null);
  return { chapters, report, ambiguousIds };
}

export async function cleanSections(
  bookTitle: string,
  sections: RawSection[],
  judge?: Judge,
): Promise<{ chapters: CleanChapter[]; report: CleanReport }> {
  const state = deterministicFilter(bookTitle, sections);
  const { removed, flagged, confident } = state;
  const pushRemoved = (sec: RawSection, rule: string, kind: string, reason: string): void => {
    removed.push(removedFor(sec, rule, kind, reason));
  };

  let llm: CleanReport["llm"] = null;
  const ambiguous = state.kept.filter((sec) => !confident.has(sec.id));
  if (ambiguous.length > 0 && judge !== undefined) {
    let result: JudgeResult | null = null;
    try {
      result = await judge(buildJudgeInput(state.kept, ambiguous, bookTitle));
    } catch {
      result = null;
    }
    if (result === null) {
      llm = { model: "unknown", promptTokens: 0, completionTokens: 0, cachedTokens: 0, costUsd: 0, error: "failed" };
    } else {
      llm = {
        provider: result.provider,
        model: result.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        cachedTokens: result.cachedTokens,
        costUsd: result.costUsd,
        fallbackUsed: result.fallbackUsed,
      };
      const byId = new Map(result.sections.map((v) => [v.id, v]));
      const contentIds = new Set(
        ambiguous.filter((sec) => byId.get(sec.id)?.verdict === "content" || confident.has(sec.id)).map((sec) => sec.id),
      );
      for (const c of state.kept) if (confident.has(c.id)) contentIds.add(c.id);
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
        const at = state.kept.indexOf(sec);
        const before = state.kept.slice(0, at).some((s) => contentIds.has(s.id));
        const behind = state.kept.slice(at + 1).some((s) => contentIds.has(s.id));
        if (sectionWords(sec) >= LONG_SECTION_WORDS && before && behind) {
          flagged.push({ sectionId: sec.id, reason: short(`long interior section kept despite verdict: ${verdict.reason}`, 120) });
          after.push(sec);
          return;
        }
        pushRemoved(sec, "llm", verdict.kind, verdict.reason);
      });
      const keptIds = new Set(after.map((s) => s.id).concat([...confident]));
      state.kept = state.kept.filter((sec) => confident.has(sec.id) || keptIds.has(sec.id));
      const headCut = Math.max(0, Math.min(Math.floor(result.headCut), HEAD_WINDOW));
      const tailCut = Math.max(0, Math.min(Math.floor(result.tailCut), TAIL_WINDOW));
      if (state.kept.length > 0 && headCut > 0) {
        const firstKept = state.kept[0];
        if (firstKept !== undefined) {
          const cut = Math.min(headCut, firstKept.blocks.length);
          if (cut > 0) {
            removed.push(removedFor(firstKept, "llm", "edge_trim", "judge headCut", [0, cut - 1]));
            state.kept = [{ ...firstKept, blocks: firstKept.blocks.slice(cut) }, ...state.kept.slice(1)];
          }
        }
      }
      if (state.kept.length > 0 && tailCut > 0) {
        const lastKept = state.kept[state.kept.length - 1];
        if (lastKept !== undefined) {
          // The judge counts from the untrimmed tail, so its cut can cover
          // blocks rule 10 removes right after. Cut only the fresh middle
          // and skip the entry entirely when nothing fresh remains. Head
          // cuts need no guard: no deterministic rule trims heads.
          const overlap = deterministicTailOverlap(state.kept, state.kept.length - 1);
          const start = Math.max(0, lastKept.blocks.length - tailCut);
          const end = lastKept.blocks.length - overlap;
          if (end > start) {
            removed.push(removedFor(lastKept, "llm", "edge_trim", "judge tailCut", [start, end - 1]));
            state.kept = [
              ...state.kept.slice(0, -1),
              { ...lastKept, blocks: [...lastKept.blocks.slice(0, start), ...lastKept.blocks.slice(end)] },
            ];
          }
        }
      }
    }
  }

  return finishBook(bookTitle, state, llm);
}

export { cleanGutenbergText } from "./clean-txt";
