// Pregenerate chapter comic pages through the same key, index, and
// spend counters as the route. Each miss spends one image, so dry-run
// first and run only with the owner's say-so.
//
// Run: npx tsx --conditions=react-server scripts/pregen-chapters.ts --book all-shelf --ch 1 --style skins --dry-run
import { existsSync, readFileSync } from "node:fs";
import type { Scene } from "../core/types";
import { createBlobStore } from "../server/images/blob";
import { usable } from "../server/guard/env";
import { createMetaClient } from "../server/images/meta";
import { createRestKV } from "../server/guard/kv";
import { utcDay } from "../server/guard/request";
import { reserveSpend } from "../server/guard/spend";
import { imageCostMicro, imageKey, indexKeyFor } from "../core/images";
import { SKIN_DEFAULT_IMAGE_STYLE, parseStyleChoice } from "../core/image-style";
import type { ImageStylePresetId } from "../core/image-style";
import { buildPregenChapterPrompt } from "../server/images/final-prompt";
import { resolveBooks } from "../server/images/pregen-plan";

// Book fields the prompt and key need; read straight from JSON, never
// via server/books (it imports next/navigation, which broke this script).
interface PregenBook {
  id: string;
  title: string;
  author: string;
  textVersion: string;
  chapters: { ch: number; title: string }[];
}

const SKIN_STYLE_IDS = [
  ...new Set(
    Object.values(SKIN_DEFAULT_IMAGE_STYLE).filter(
      (v): v is ImageStylePresetId => v !== undefined,
    ),
  ),
];

const USAGE = `usage: pregen-chapters.ts [--book <id>|all-shelf] [--ch all|1,2] [--style skins|<id>] [--dry-run]
  --book oz         one ready shelf book (default oz)
  --book all-shelf  every ready shelf book except oz, in library order
  --ch all          every chapter (default)
  --ch 1,2          only these chapters
  --style skins     every skin default style (default)
  --style <id>      one of: ${SKIN_STYLE_IDS.join(", ")}
  --dry-run         list cached and planned pages plus expected USD, spend nothing`;

function flag(name: string): boolean {
  return process.argv.includes(name);
}

function opt(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v === undefined || v.startsWith("--") ? undefined : v;
}

function usd(micro: number): string {
  return `$${(micro / 1_000_000).toFixed(2)}`;
}

function parseCapUsd(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

// Ready shelf ids in library order: manifest order, favorites first
// (mirrors core/library.ts), keeping only ids with data on disk.
function readyShelfIds(): string[] {
  const raw = JSON.parse(readFileSync("data/library.json", "utf8")) as unknown;
  if (!Array.isArray(raw)) throw new Error("library manifest must be an array");
  const entries: { id: string; favorite: boolean }[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, status, favorite } = entry as Record<string, unknown>;
    if (typeof id !== "string" || status !== "ready") continue;
    if (!existsSync(`data/books/${id}`)) continue;
    entries.push({ id, favorite: favorite === true });
  }
  entries.sort((a, b) => Number(b.favorite) - Number(a.favorite));
  return entries.map((e) => e.id);
}

// Names only, never values.
function missingEnv(): string[] {
  const rawUrl = usable(process.env.UPSTASH_REDIS_REST_URL) ?? usable(process.env.KV_REST_API_URL);
  const rawToken =
    usable(process.env.UPSTASH_REDIS_REST_TOKEN) ?? usable(process.env.KV_REST_API_TOKEN);
  const url = rawUrl?.startsWith("https://") ? rawUrl : undefined;
  return [
    url ? null : "UPSTASH_REDIS_REST_URL|KV_REST_API_URL",
    rawToken ? null : "UPSTASH_REDIS_REST_TOKEN|KV_REST_API_TOKEN",
    usable(process.env.BLOB_READ_WRITE_TOKEN) ? null : "BLOB_READ_WRITE_TOKEN",
    usable(process.env.META_API_KEY) ? null : "META_API_KEY",
  ].filter((m): m is string => m !== null);
}

async function main(): Promise<void> {
  if (flag("--help") || flag("-h")) {
    console.log(USAGE);
    return;
  }
  const dryRun = flag("--dry-run");

  // Validate books, chapters, and styles before env or spend, so a bad
  // flag fails fast without touching the network.
  let bookIds: string[];
  try {
    bookIds = resolveBooks(opt("--book"), readyShelfIds());
  } catch (e) {
    console.error(e instanceof Error ? e.message : "unknown book");
    process.exit(1);
  }
  const multi = bookIds.length > 1;
  const chArg = opt("--ch") ?? "all";
  const plans: { id: string; book: PregenBook; scenes: Scene[]; wantCh: number[] }[] = [];
  for (const id of bookIds) {
    const read = (f: string): unknown => JSON.parse(readFileSync(`data/books/${id}/${f}`, "utf8"));
    const book = read("book.json") as PregenBook;
    const { scenes } = read("analysis.json") as { scenes: Scene[] };
    const known = new Map(book.chapters.map((c) => [c.ch, c.title]));
    const all = [...known.keys()].sort((a, b) => a - b);
    const wantCh =
      chArg === "all" ? all : chArg.split(",").map((s) => Number(s.trim()));
    for (const ch of wantCh) {
      if (!Number.isInteger(ch) || !known.has(ch)) {
        console.error(
          multi
            ? `unknown chapter for ${id}: ${chArg} (book has ${all.join(",")})`
            : `unknown chapter: ${chArg} (book has ${all.join(",")})`,
        );
        process.exit(1);
      }
    }
    plans.push({ id, book, scenes, wantCh });
  }
  const styleArg = opt("--style") ?? "skins";
  const wantStyles =
    styleArg === "skins" ? SKIN_STYLE_IDS : SKIN_STYLE_IDS.filter((id) => id === styleArg);
  if (wantStyles.length === 0) {
    console.error(`unknown style: ${styleArg} (one of: skins, ${SKIN_STYLE_IDS.join(", ")})`);
    process.exit(1);
  }

  let missing = missingEnv();
  if (missing.length > 0 && existsSync(".env.local")) {
    try {
      process.loadEnvFile(".env.local");
    } catch {
      // Fall through to the missing-names error below.
    }
    missing = missingEnv();
  }
  if (missing.length > 0) {
    console.error(`missing image env: ${missing.join(",")}`);
    process.exit(1);
  }
  const capMicro = Math.round(parseCapUsd(process.env.SPEND_CAP_USD, 10) * 1_000_000);
  const dailyCapMicro = Math.round(parseCapUsd(process.env.DAILY_SPEND_CAP_USD, 2) * 1_000_000);

  const rawUrl = usable(process.env.UPSTASH_REDIS_REST_URL) ?? usable(process.env.KV_REST_API_URL);
  const rawToken =
    usable(process.env.UPSTASH_REDIS_REST_TOKEN) ?? usable(process.env.KV_REST_API_TOKEN);
  const kv = createRestKV(rawUrl as string, rawToken as string);
  const store = createBlobStore();
  const generate = createMetaClient(process.env.META_API_KEY as string);
  const day = utcDay();
  const cost = imageCostMicro();
  let totalCached = 0;
  let totalGenerated = 0;
  let totalFailed = 0;
  let totalPlanned = 0;

  for (const plan of plans) {
    let cached = 0;
    let generated = 0;
    let failed = 0;
    let planned = 0;
    const line = (msg: string): string => (multi ? `${plan.id} ${msg}` : msg);
    for (const ch of plan.wantCh) {
      for (const styleId of wantStyles) {
        const style = parseStyleChoice({ preset: styleId });
        const key = imageKey({
          kind: "chapter",
          bookId: plan.book.id,
          textVersion: plan.book.textVersion,
          ch,
          reachedCh: ch,
          ...(style === undefined ? {} : { style }),
        });
        const indexKey = indexKeyFor(key);
        const hit = await kv.get(indexKey);
        if (hit) {
          cached++;
          console.log(line(`ch ${ch} ${styleId} cached ${hit}`));
          continue;
        }
        const blobUrl = await store.findUrl(key);
        if (blobUrl) {
          try {
            await kv.set(indexKey, blobUrl);
          } catch {
            // The file exists; the next run backfills again.
          }
          cached++;
          console.log(line(`ch ${ch} ${styleId} cached ${blobUrl}`));
          continue;
        }
        if (dryRun) {
          planned++;
          console.log(line(`ch ${ch} ${styleId} planned`));
          continue;
        }
        const spent = await reserveSpend(kv, {
          amountMicro: cost,
          day,
          spendCapMicro: capMicro,
          dailySpendCapMicro: dailyCapMicro,
        });
        if (!spent.ok) {
          const at = multi ? `at ${plan.id} ch ${ch} ${styleId}` : `at ch ${ch} ${styleId}`;
          console.log(
            spent.which === "total"
              ? `Stopped: spend cap reached ${at}, reserve refunded.`
              : `Stopped: daily spend cap reached ${at}, reserve refunded.`,
          );
          process.exitCode = 1;
          return;
        }
        const refund = (): Promise<void> => spent.reservation.release();
        let bytes: Uint8Array;
        try {
          bytes = await generate.generate(
            buildPregenChapterPrompt({ book: plan.book, scenes: plan.scenes, ch, style }),
          );
        } catch {
          await refund();
          failed++;
          console.log(line(`ch ${ch} ${styleId} failed -`));
          continue;
        }
        let saved: string;
        try {
          saved = await store.save(key, bytes);
        } catch {
          await refund();
          failed++;
          console.log(line(`ch ${ch} ${styleId} failed -`));
          continue;
        }
        try {
          await kv.set(indexKey, saved);
        } catch {
          // The file exists; the next run backfills the index.
        }
        generated++;
        console.log(line(`ch ${ch} ${styleId} generated ${saved}`));
      }
    }
    totalCached += cached;
    totalGenerated += generated;
    totalFailed += failed;
    totalPlanned += planned;
    if (multi) {
      console.log(
        dryRun
          ? `${plan.id}: ${planned} planned, ${cached} cached`
          : `${plan.id}: ${cached} cached, ${generated} generated, ${failed} failed`,
      );
    }
  }

  if (dryRun) {
    console.log(
      `Planned: ${totalPlanned} pages (${totalCached} cached), expected ${usd(totalPlanned * cost)}.`,
    );
  } else {
    console.log(
      `Total: ${totalCached + totalGenerated + totalFailed} pages (${totalCached} cached, ${totalGenerated} generated, ${totalFailed} failed). Spent ${usd(totalGenerated * cost)}.`,
    );
  }
}

try {
  await main();
} catch (e) {
  console.error(`pregen failed: ${e instanceof Error ? e.message : "unknown"}`);
  process.exit(1);
}
