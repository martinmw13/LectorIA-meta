// Pure upload routing: which path a parsed book takes. Client-safe.
export const FREE_BOOK_MAX_WORDS = 50_000; // provisional, may change once we know the processing cost
export const WORDS_PER_PAGE = 250;

export function approxPages(words: number): number {
  return Math.max(1, Math.round(words / WORDS_PER_PAGE));
}

export type UploadRoute = { kind: "free" } | { kind: "byok"; reason: "too_long" | "free_used" };

// A long book needs its own key even when the free book is still unused.
export function uploadRoute(words: number, freeBookUsed: boolean): UploadRoute {
  if (words > FREE_BOOK_MAX_WORDS) return { kind: "byok", reason: "too_long" };
  if (freeBookUsed) return { kind: "byok", reason: "free_used" };
  return { kind: "free" };
}
