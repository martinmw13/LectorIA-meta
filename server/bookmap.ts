import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateBookmap, type BookMap } from "@/core/bookmap";

// Loads the enrichment map when it exists and matches this text. A
// missing, unreadable, invalid, or stale file returns null, so books
// without it keep working exactly as before.
export function loadBookmap(bookId: string, textVersion: string, root = join(process.cwd(), "data/books")): BookMap | null {
  let raw: string;
  try {
    raw = readFileSync(join(root, bookId, "bookmap.json"), "utf8");
  } catch {
    return null;
  }
  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  const bookmap = validateBookmap(data);
  if (!bookmap || bookmap.bookId !== bookId || bookmap.textVersion !== textVersion) return null;
  return bookmap;
}
