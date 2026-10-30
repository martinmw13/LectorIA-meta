// CLI: npm run narrate -- --book <id|all-shelf> --voice <id|all> [--force] [--dry-run]
// --dry-run prints a cost estimate per book and a total, reading only
// book.json: no Modal or Blob calls.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NARRATION_VOICES, chapterChunks, estimateNarrationMicro } from "../core/narration";
import type { Book } from "../core/types";
import books from "./books.json" with { type: "json" };
import { runNarrate } from "./narrate";

export const SHELF_BOOKS = Object.keys(books);
export const VOICE_IDS = NARRATION_VOICES.map((v) => v.id);

export interface NarrateSelection {
  books: string[];
  voices: string[];
  force: boolean;
  dryRun: boolean;
}

function flagValue(args: string[], flag: string): string | undefined {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
}

function expand(value: string | undefined, all: string, valid: string[], name: string): string[] {
  if (value === undefined || value === "") throw new Error(`usage: narrate --book <${[...valid, all].join("|")}> --voice <id|all> [--force] [--dry-run]`);
  if (value === all) return [...valid];
  if (!valid.includes(value)) throw new Error(`unknown ${name} "${value}", valid: ${[...valid, all].join(", ")}`);
  return [value];
}

export function parseNarrateArgs(args: string[]): NarrateSelection {
  const books = expand(flagValue(args, "--book"), "all-shelf", SHELF_BOOKS, "book");
  const voices = expand(flagValue(args, "--voice"), "all", VOICE_IDS, "voice");
  return { books, voices, force: args.includes("--force"), dryRun: args.includes("--dry-run") };
}

export interface BookEstimate {
  chapters: number;
  chars: number;
  micro: number;
}

// Offline cost estimate for one book dir: sums estimateNarrationMicro
// over every chapter, the same math the run reserves per chapter.
export function estimateBook(dir: string): BookEstimate {
  const book = JSON.parse(readFileSync(join(dir, "book.json"), "utf8")) as Book;
  let chars = 0;
  let micro = 0;
  for (const chapter of book.chapters) {
    const paras = book.paragraphs
      .filter((p) => p.ch === chapter.ch)
      .sort((a, b) => a.n - b.n)
      .map((p) => ({ n: p.n, text: p.text }));
    const { chunks } = chapterChunks(paras);
    const total = chunks.reduce((sum, c) => sum + c.text.length, 0);
    chars += total;
    micro += estimateNarrationMicro(total);
  }
  return { chapters: book.chapters.length, chars, micro };
}

function usd(micro: number): string {
  return `$${(micro / 1_000_000).toFixed(4)}`;
}

async function main(): Promise<void> {
  if (typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(".env.local");
    } catch {
      // Env may come from elsewhere; the run fails fast below if needed.
    }
  }
  const selection = parseNarrateArgs(process.argv.slice(2));
  if (selection.dryRun) {
    let total = 0;
    for (const book of selection.books) {
      const dir = join("data", "books", book);
      let estimate: BookEstimate;
      try {
        estimate = estimateBook(dir);
      } catch {
        console.log(`${book}: no book.json yet (run build:book first)`);
        continue;
      }
      const perVoice = estimate.micro;
      const subtotal = perVoice * selection.voices.length;
      total += subtotal;
      console.log(
        `${book}: ${estimate.chapters} chapters, ${estimate.chars} chars, ` +
          `${usd(perVoice)} per voice x ${selection.voices.length} (${selection.voices.join(", ")}) = ${usd(subtotal)}`,
      );
    }
    console.log(`dry run total: ${usd(total)} (no Modal or Blob calls made)`);
    return;
  }
  const { createKokoroClient } = await import("./kokoro");
  const client = createKokoroClient();
  for (const book of selection.books) {
    for (const voice of selection.voices) {
      console.log(`narrate ${book} ${voice}`);
      await runNarrate(
        { bookKey: book, force: selection.force, dir: join("data", "books", book) },
        { synthesize: (req) => client.synthesize(req), voice },
      );
    }
  }
}

// Running the tests imports this module, so main runs only as a script.
if (process.argv[1]?.endsWith("narrate-cli.ts") || process.argv[1]?.endsWith("narrate-cli.js")) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
