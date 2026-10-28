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
    (b.favorite === undefined || typeof b.favorite === "boolean")
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
