// Step 1: ingest the raw Gutenberg text into data/books/<key>/book.json.
// Frozen: a textVersion drift fails unless --force; a match leaves the
// file untouched.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildBook, canonicalLines, splitChapters, stripGutenberg } from "../core/gutenberg";
import type { Book } from "../core/types";
import books from "./books.json" with { type: "json" };

export interface StepCtx {
  bookKey: string;
  force: boolean;
  dir: string;
}

export function bookConfig(bookKey: string): { gutenberg: number; title: string; author: string } {
  const config = (books as Record<string, { gutenberg: number; title: string; author: string }>)[bookKey];
  if (!config) throw new Error(`unknown book "${bookKey}", valid keys: ${Object.keys(books).join(", ")}`);
  return config;
}

export function textVersionFor(book: Omit<Book, "textVersion">): string {
  return `sha256:${createHash("sha256").update(canonicalLines(book.paragraphs)).digest("hex")}`;
}

async function loadRaw(bookKey: string, gutenberg: number, fetchFn: typeof fetch): Promise<string> {
  const local = join("data", "raw", bookKey, `pg${gutenberg}.txt`);
  if (existsSync(local)) return readFileSync(local, "utf8");
  const url = `https://www.gutenberg.org/cache/epub/${gutenberg}/pg${gutenberg}.txt`;
  const response = await fetchFn(url);
  if (!response.ok) throw new Error(`download failed with status ${response.status}`);
  return await response.text();
}

export async function runIngest(ctx: StepCtx, deps?: { fetchFn?: typeof fetch }): Promise<Book> {
  const config = bookConfig(ctx.bookKey);
  const raw = await loadRaw(ctx.bookKey, config.gutenberg, deps?.fetchFn ?? fetch);
  const drafts = splitChapters(stripGutenberg(raw));
  if (drafts.length === 0) throw new Error("no chapters found after ingest");
  const book = { ...buildBook({ id: ctx.bookKey, ...config, chapters: drafts }), textVersion: "" };
  book.textVersion = textVersionFor(book);
  mkdirSync(ctx.dir, { recursive: true });
  const path = join(ctx.dir, "book.json");
  if (existsSync(path)) {
    const existing = JSON.parse(readFileSync(path, "utf8")) as Book;
    if (existing.textVersion === book.textVersion) return existing;
    if (!ctx.force) {
      throw new Error(`textVersion drift for ${ctx.bookKey} (rerun with --force to overwrite)`);
    }
  }
  writeFileSync(path, `${JSON.stringify(book)}\n`);
  return book;
}
