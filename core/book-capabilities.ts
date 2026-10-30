// Per-book capabilities: one place answering which shelf books support
// which features, so callers never hard-code a book id. Only Oz has
// pregenerated chapter pages and legacy /leer addresses today, and only
// Oz keeps the 1900 Denslow look by default. Narration stays data-driven
// (loaded manifest entries), never id-based.
export const LEGACY_ROUTE_BOOK_ID = "oz";

export function hasLegacyRoutes(bookId: string): boolean {
  return bookId === LEGACY_ROUTE_BOOK_ID;
}

export function hasPanels(bookId: string): boolean {
  return bookId === "oz";
}

export function hasDenslowLook(bookId: string | undefined): boolean {
  return bookId === undefined || bookId === "oz";
}

export function hasNarration(entries: readonly { ch: number }[]): boolean {
  return entries.length > 0;
}
