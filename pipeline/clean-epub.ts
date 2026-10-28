// CLI: npm run clean:epub -- <file.epub> [--no-llm]
// Prints kept chapters, removed items grouped by rule, flagged sections,
// and the LLM cost. Writes the full report plus chapters to
// pipeline/out/clean/<basename>.json.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { JSDOM } from "jsdom";
import { cleanSections } from "../core/clean";
import type { Judge } from "../core/clean";
import { readEpubSections } from "../core/epub-sections";
import { createCleanJudge } from "./clean-judge";
import { createMetaClient } from "./meta";

function loadEnv(): void {
  try {
    if (typeof process.loadEnvFile === "function") process.loadEnvFile(".env.local");
  } catch {
    // No .env.local is fine; env may come from elsewhere.
  }
}

async function main(): Promise<void> {
  loadEnv();
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--")) ?? "";
  const noLlm = args.includes("--no-llm");
  if (file === "") throw new Error("usage: clean:epub <file.epub> [--no-llm]");
  const bytes = new Uint8Array(readFileSync(file));
  const { title, sections } = readEpubSections(bytes, (text, type) => {
    if (type === "text/html") return new JSDOM(text).window.document;
    return new JSDOM(text, { contentType: type }).window.document;
  });
  let judge: Judge | undefined;
  if (!noLlm) {
    const apiKey = process.env.META_API_KEY ?? "";
    if (apiKey === "") throw new Error("META_API_KEY is not set");
    judge = createCleanJudge(
      createMetaClient({ apiKey, model: process.env.CLEAN_MODEL ?? "muse-spark-1.3-contributor" }),
    );
  }
  const { chapters, report } = await cleanSections(title, sections, judge);
  if (chapters.length === 0) throw new Error("no chapters kept after cleaning");
  for (const chapter of chapters) {
    console.log(`keep: ${chapter.title} (${chapter.paragraphs.length} paragraphs)`);
  }
  const byRule = new Map<string, string[]>();
  for (const item of report.removed) {
    const list = byRule.get(item.rule) ?? [];
    list.push(item.sectionId);
    byRule.set(item.rule, list);
  }
  for (const [rule, ids] of [...byRule.entries()].sort()) {
    console.log(`removed ${rule}: ${ids.length} (${ids.join(", ")})`);
  }
  for (const flag of report.flagged) {
    console.log(`flagged: ${flag.sectionId} (${flag.reason})`);
  }
  for (const merge of report.merged) {
    console.log(`merged: ${merge.from} into ${merge.into} (${merge.reason})`);
  }
  if (report.llm === null) {
    console.log("llm: skipped (no ambiguous sections or --no-llm)");
  } else if (report.llm.error !== undefined) {
    console.log("llm: failed, kept deterministic output");
  } else {
    console.log(
      `llm: ${report.llm.model} prompt=${report.llm.promptTokens} completion=${report.llm.completionTokens} cached=${report.llm.cachedTokens} cost=$${report.llm.costUsd.toFixed(4)}`,
    );
  }
  const outDir = join("pipeline", "out", "clean");
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `${basename(file, ".epub")}.json`);
  writeFileSync(out, `${JSON.stringify({ chapters, report })}\n`);
  console.log(`wrote ${out}`);
}

main().catch((error: unknown) => {
  console.error(`error: ${(error as Error).message}`);
  process.exit(1);
});
