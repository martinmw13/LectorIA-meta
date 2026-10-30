// CLI: npx tsx pipeline/enrich.ts <book> [--dry-run] [--max-usd N] [--force]
// Runs the bookmap pass over an already-segmented book. --dry-run prints
// the estimated cost and stops before any client or network call.
import { join } from "node:path";
import { runBookmap } from "./bookmap";
import { bookConfig } from "./ingest";
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
  const bookKey = args.find((a) => !a.startsWith("--")) ?? "";
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const maxFlag = args.indexOf("--max-usd");
  const maxUsd = maxFlag === -1 ? 4 : Number(args[maxFlag + 1]);
  if (!bookKey) throw new Error("usage: enrich <book> [--dry-run] [--max-usd N] [--force]");
  if (!Number.isFinite(maxUsd) || maxUsd <= 0) throw new Error("--max-usd must be a positive number");
  bookConfig(bookKey); // fails fast on unknown keys with the valid list
  const dir = join("data", "books", bookKey);
  const model = process.env.META_MODEL ?? "muse-spark-1.3";
  if (dryRun) {
    const run = await runBookmap(dir, { model, maxUsd, force, dryRun: true });
    console.log(`enrich: ${run.chaptersDone}/${run.chaptersTotal} chapters cached, estimated $${run.estimatedUsd.toFixed(4)} (cap $${maxUsd})`);
    return;
  }
  const apiKey = process.env.META_API_KEY;
  if (!apiKey) throw new Error("META_API_KEY is not set");
  const meta = createMetaClient({ apiKey, model });
  const run = await runBookmap(dir, { meta, model, maxUsd, force, log: (m) => console.log(m) });
  if (run.status === "reuse") {
    console.log("enrich: bookmap.json is current, no calls made");
    return;
  }
  console.log(`enrich: done, estimated $${run.estimatedUsd.toFixed(4)}, actual $${run.actualUsd.toFixed(4)} (${run.requests} calls)`);
}

main().catch((error: unknown) => {
  console.error(`error: ${(error as Error).message}`);
  process.exit(1);
});
