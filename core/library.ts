// Preloaded classics for the home library grid. Ready favorites first,
// the rest in manifest order, so new books need no UI change.
import manifest from "../data/library.json";

export interface LibraryBook {
  id: string;
  title: string;
  author: string;
  year: number;
  words: number;
  gutenbergId: number;
  status: "ready";
  favorite?: boolean;
  cover: string;
  coverAlt: string;
}

function isBook(value: unknown): value is LibraryBook {
  if (typeof value !== "object" || value === null) return false;
  const b = value as Record<string, unknown>;
  return (
    typeof b.id === "string" &&
    typeof b.title === "string" &&
    typeof b.author === "string" &&
    typeof b.year === "number" &&
    typeof b.words === "number" &&
    typeof b.gutenbergId === "number" &&
    b.status === "ready" &&
    (b.favorite === undefined || typeof b.favorite === "boolean") &&
    typeof b.cover === "string" &&
    b.cover.startsWith("/art/") &&
    typeof b.coverAlt === "string" &&
    b.coverAlt.length > 0
  );
}

export function loadLibrary(raw: unknown = manifest): LibraryBook[] {
  if (!Array.isArray(raw)) throw new Error("library manifest must be an array");
  const books = raw.map((entry) => {
    if (!isBook(entry)) throw new Error(`bad library entry: ${JSON.stringify(entry)}`);
    return entry;
  });
  return [...books].sort((a, b) => Number(b.favorite ?? false) - Number(a.favorite ?? false));
}

// 250 words/min, rounded to the minute.
export function readingMinutes(words: number): string {
  const total = Math.max(1, Math.round(words / 250));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours === 0) return `About ${mins} min`;
  if (mins === 0) return `About ${hours} h`;
  return `About ${hours} h ${mins} min`;
}

export const library: LibraryBook[] = loadLibrary();

// Ready ids in shelf order (favorites first, manifest order otherwise),
// skipping entries that are not listed ready. The server book loader map
// and the pregen scripts share this order and filter so the lists cannot
// drift apart; each side only adds its own availability check (loader
// entry on the server, data on disk for scripts).
export function shelfReadyIds(raw: unknown = manifest): string[] {
  if (!Array.isArray(raw)) throw new Error("library manifest must be an array");
  const entries: { id: string; favorite: boolean }[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, status, favorite } = entry as Record<string, unknown>;
    if (typeof id !== "string" || status !== "ready") continue;
    entries.push({ id, favorite: favorite === true });
  }
  entries.sort((a, b) => Number(b.favorite) - Number(a.favorite));
  return entries.map((e) => e.id);
}
