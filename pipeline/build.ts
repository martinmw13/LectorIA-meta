// CLI: npm run build:book -- oz [--step ingest|segment|classify|resplit|cluster] [--force]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runClassify } from "./classify";
import { runCluster } from "./cluster-tracks";
import { bookConfig, runIngest } from "./ingest";
import type { StepCtx } from "./ingest";
import { createJevClient } from "./jev";
import { createMetaClient } from "./meta";
import { runResplit } from "./resplit";
import { runSegment } from "./segment";

const STEPS = ["ingest", "segment", "classify", "resplit", "cluster"] as const;

function loadEnv(): void {
  try {
    if (typeof process.loadEnvFile === "function") process.loadEnvFile(".env.local");
  } catch {
    // No .env.local is fine; env may come from elsewhere.
  }
}

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") throw new Error(`${name} is not set`);
  return value;
}

async function main(): Promise<void> {
  loadEnv();
  const args = process.argv.slice(2);
  const bookKey = args.find((a) => !a.startsWith("--")) ?? "";
  const stepFlag = args.indexOf("--step");
  const stepArg = stepFlag === -1 ? undefined : args[stepFlag + 1];
  const force = args.includes("--force");
  if (!bookKey) throw new Error("usage: build:book <book> [--step ingest|segment|classify|resplit|cluster] [--force]");
  bookConfig(bookKey); // fails fast on unknown keys with the valid list
  const only = stepArg ?? "";
  if (only !== "" && !(STEPS as readonly string[]).includes(only)) {
    throw new Error(`unknown step "${only}", valid steps: ${STEPS.join(", ")}`);
  }
  const ctx: StepCtx = { bookKey, force, dir: join("data", "books", bookKey) };
  const run: Record<(typeof STEPS)[number], boolean> = {
    ingest: only === "" || only === "ingest",
    segment: only === "" || only === "segment",
    classify: only === "" || only === "classify",
    resplit: only === "" || only === "resplit",
    cluster: only === "" || only === "cluster",
  };
  if (run.ingest) {
    const book = await runIngest(ctx);
    console.log(`ingest: ${book.chapters.length} chapters, ${book.paragraphs.length} paragraphs, ${book.textVersion}`);
  }
  if (run.segment) {
    const meta = createMetaClient({ apiKey: env("META_API_KEY"), model: process.env.META_MODEL ?? "muse-spark-1.3-contributor" });
    console.log(`segment: ${meta.model}`);
    const scenes = await runSegment(ctx, { meta });
    console.log(`segment: ${scenes.length} scenes`);
  }
  if (run.classify) {
    const meta = createMetaClient({ apiKey: env("META_API_KEY"), model: process.env.META_MODEL ?? "muse-spark-1.3-contributor" });
    const jev = createJevClient({ apiKey: env("JEV_API_KEY"), model: process.env.JEV_MODEL ?? "jev-1.14.0" });
    const scenes = await runClassify(ctx, { jev, meta });
    const overrides = scenes.filter((s) => s.muse_override !== null).length;
    const failures = scenes.filter((s) => s.final === null).length;
    console.log(`classify: ${scenes.length} scenes, ${overrides} overrides, ${failures} failures`);
  }
  if (run.resplit) {
    const meta = createMetaClient({ apiKey: env("META_API_KEY"), model: process.env.META_MODEL ?? "muse-spark-1.3-contributor" });
    const jev = createJevClient({ apiKey: env("JEV_API_KEY"), model: process.env.JEV_MODEL ?? "jev-1.14.0" });
    const scenes = await runResplit(ctx, { jev, meta });
    console.log(`resplit: ${scenes.length} scenes`);
  }
  if (run.cluster) {
    await runCluster(ctx);
    console.log("cluster: wrote music-clusters.json");
  }
  printSummary(ctx.dir);
}

function printSummary(dir: string): void {
  const book = JSON.parse(readFileSync(join(dir, "book.json"), "utf8")) as {
    chapters: unknown[];
    paragraphs: unknown[];
  };
  let scenes: { final: { vector: Record<string, number> } | null }[] = [];
  let overrideRate = 0;
  let jev = { cost_usd: 0 };
  let meta = { cost_usd: 0 };
  let total = 0;
  try {
    const analysis = JSON.parse(readFileSync(join(dir, "analysis.json"), "utf8")) as {
      scenes: (typeof scenes)[number][];
      override_rate: number;
      provenance: { jev: typeof jev; meta: typeof meta; total_cost_usd: number };
    };
    scenes = analysis.scenes;
    overrideRate = analysis.override_rate;
    jev = analysis.provenance.jev;
    meta = analysis.provenance.meta;
    total = analysis.provenance.total_cost_usd;
  } catch {
    // Steps after ingest may not have run yet.
  }
  const dist = new Map<string, number>();
  let failures = 0;
  for (const scene of scenes) {
    if (!scene.final) {
      failures += 1;
      continue;
    }
    const top = Object.entries(scene.final.vector).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "?";
    dist.set(top, (dist.get(top) ?? 0) + 1);
  }
  console.log(`summary: ${book.chapters.length} chapters, ${book.paragraphs.length} paragraphs, ${scenes.length} scenes`);
  console.log(`emotions: ${[...dist.entries()].map(([id, count]) => `${id} ${count}`).join(", ") || "none yet"}`);
  console.log(`override rate ${((overrideRate ?? 0) * 100).toFixed(1)}%, failures ${failures}`);
  console.log(`cost: jev $${(jev.cost_usd ?? 0).toFixed(4)}, meta $${(meta.cost_usd ?? 0).toFixed(4)}, total $${(total ?? 0).toFixed(4)}`);
}

main().catch((error: unknown) => {
  console.error(`error: ${(error as Error).message}`);
  process.exit(1);
});
