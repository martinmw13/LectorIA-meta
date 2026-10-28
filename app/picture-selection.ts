// Start paragraph of a selection: of the two boundary paragraphs,
// whichever comes first in document order. Entries arrive in DOM order
// from one live query, so the first match wins. Null when the selection
// sits outside the book.
export interface ParaEntry {
  id: string;
  n: number;
}

export function pickStartN(
  entries: ParaEntry[],
  aId: string | null,
  bId: string | null,
): number | null {
  if (aId === null && bId === null) return null;
  for (const entry of entries) {
    if (entry.id === aId || entry.id === bId) return entry.n;
  }
  return null;
}
