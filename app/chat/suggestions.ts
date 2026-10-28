// Suggested questions per chapter, bundled from the data file owned by
// another author. Missing chapters fall back to generic questions so the
// panel never renders empty.
import bundled from "../../data/books/oz/chat-suggestions.json";

export interface SuggestionFile {
  chapters: { ch: number; questions: string[] }[];
}

export const SUGGESTION_FILE = bundled as SuggestionFile;

export const FALLBACK_QUESTIONS = [
  "Who has Dorothy met so far?",
  "Remind me what just happened",
  "What is Dorothy hoping for?",
] as const;

// Pure: the chapter's own three, or the fallback when missing or short.
export function questionsForChapter(
  ch: number,
  file: SuggestionFile | null = SUGGESTION_FILE,
): string[] {
  const found = file?.chapters?.find((e) => e?.ch === ch)?.questions;
  if (Array.isArray(found)) {
    const qs = found.filter((q): q is string => typeof q === "string" && q.trim() !== "");
    if (qs.length >= 3) return qs.slice(0, 3);
  }
  return [...FALLBACK_QUESTIONS];
}
