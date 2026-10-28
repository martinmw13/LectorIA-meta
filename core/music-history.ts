// Bounded stack of played track ids for Previous. Pure: the reader owns
// the array, these helpers push and pop it. Automatic switches and Next
// push the outgoing id; Previous pops without pushing back.
export const HISTORY_LIMIT = 50;

export function pushHistory(hist: readonly string[], id: string | null): string[] {
  if (id === null) return [...hist];
  const next = [...hist, id];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

export function popHistory(hist: readonly string[]): { hist: string[]; id: string } | null {
  if (hist.length === 0) return null;
  return { hist: hist.slice(0, -1), id: hist[hist.length - 1] as string };
}
