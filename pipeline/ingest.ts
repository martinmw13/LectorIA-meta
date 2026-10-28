// Step 1: ingest the raw Gutenberg text into data/books/<key>/book.json.
// Frozen: a textVersion drift fails unless --force; a match leaves the
// file untouched.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { cleanSections } from "../core/clean";
import type { Judge } from "../core/clean";
import { readEpubSections } from "../core/epub-sections";
import { buildBook, canonicalLines, splitChapters, stripGutenberg } from "../core/gutenberg";
import type { Book } from "../core/types";
import books from "./books.json" with { type: "json" };

export interface StepCtx {
  bookKey: string;
  force: boolean;
  dir: string;
}

export interface BookConfig {
  gutenberg: number;
  title: string;
  author: string;
  format?: string;
}

export function bookConfig(bookKey: string): BookConfig {
  const config = (books as Record<string, BookConfig>)[bookKey];
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

async function loadEpub(
  bookKey: string,
  gutenberg: number,
  fetchFn: typeof fetch,
): Promise<Uint8Array> {
  const local = join("data", "raw", bookKey, `pg${gutenberg}.epub`);
  if (existsSync(local)) return new Uint8Array(readFileSync(local));
  const url = `https://www.gutenberg.org/cache/epub/${gutenberg}/pg${gutenberg}-images-3.epub`;
  const response = await fetchFn(url);
  if (!response.ok) throw new Error(`download failed with status ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function runIngest(
  ctx: StepCtx,
  deps?: { fetchFn?: typeof fetch; judge?: Judge; config?: BookConfig },
): Promise<Book> {
  const config = deps?.config ?? bookConfig(ctx.bookKey);
  if (config.format === "epub") {
    const bytes = await loadEpub(ctx.bookKey, config.gutenberg, deps?.fetchFn ?? fetch);
    const { title, sections } = readEpubSections(bytes, (text, type) => {
      if (type === "text/html") return new JSDOM(text).window.document;
      return new JSDOM(text, { contentType: type }).window.document;
    });
    void title;
    const cleaned = await cleanSections(config.title, sections, deps?.judge);
    if (cleaned.chapters.length === 0) throw new Error("no chapters found after cleaning");
    const drafts = cleaned.chapters.map((c) => ({ title: c.title, paragraphs: c.paragraphs }));
    return writeBook(
      ctx,
      { title: config.title, author: config.author, gutenberg: config.gutenberg, chapters: drafts },
      () => {
        mkdirSync(ctx.dir, { recursive: true });
        writeFileSync(join(ctx.dir, "clean-report.json"), `${JSON.stringify(cleaned.report)}\n`);
      },
    );
  }
  const raw = await loadRaw(ctx.bookKey, config.gutenberg, deps?.fetchFn ?? fetch);
  const drafts = splitChapters(stripGutenberg(raw));
  if (drafts.length === 0) throw new Error("no chapters found after ingest");
  return writeBook(ctx, { title: config.title, author: config.author, gutenberg: config.gutenberg, chapters: drafts });
}

function writeBook(
  ctx: StepCtx,
  input: { title: string; author: string; gutenberg: number; chapters: { title: string; paragraphs: string[] }[] },
  afterDriftCheck?: () => void,
): Book {
  const book = { ...buildBook({ id: ctx.bookKey, ...input }), textVersion: "" };
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
  afterDriftCheck?.();
  writeFileSync(path, `${JSON.stringify(book)}\n`);
  return book;
}
