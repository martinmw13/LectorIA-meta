// Cleaning input/output types. Pure data: no env reads, no network.
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
