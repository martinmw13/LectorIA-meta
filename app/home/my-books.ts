// "Your books": ids of finished uploads, so the home shelf links back
// to them. Metadata only: no text, never a key.
import { isUploadId } from "@/core/uploads";

export interface MyBook {
  id: string;
  title: string;
  author: string;
  savedAt: number;
}

const KEY = "lectoria.myBooks.v1";
export const MY_BOOKS_MAX = 20;

function isEntry(value: unknown): value is MyBook {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    isUploadId(e.id) &&
    typeof e.title === "string" &&
    e.title !== "" &&
    typeof e.author === "string" &&
    typeof e.savedAt === "number" &&
    Number.isFinite(e.savedAt)
  );
}

export function loadMyBooks(): MyBook[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry);
  } catch {
    return []; // Bad JSON or blocked storage: show no books.
  }
}

function store(books: MyBook[]): MyBook[] {
  const kept = books.slice(0, MY_BOOKS_MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    // Private mode: the list lives for this visit only.
  }
  return kept;
}

// Newest first; re-saving an id moves it to the front.
export function saveMyBook(entry: MyBook): MyBook[] {
  return store([entry, ...loadMyBooks().filter((b) => b.id !== entry.id)]);
}

// Forgets locally only; the upload itself is untouched.
export function removeMyBook(id: string): MyBook[] {
  return store(loadMyBooks().filter((b) => b.id !== id));
}
