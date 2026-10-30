// Pregenerate chapter comic pages through the same key, index, and
// spend counters as the route. Each miss spends one image, so dry-run
// first and run only with the owner's say-so.
//
// Run: npx tsx --conditions=react-server scripts/pregen-chapters.ts
//   [--ch all|1,2] [--style skins|<id>] [--dry-run]
import { loadBook } from "../server/books";
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

const SKIN_STYLE_IDS = [
  ...new Set(
    Object.values(SKIN_DEFAULT_IMAGE_STYLE).filter(
      (v): v is ImageStylePresetId => v !== undefined,
    ),
  ),
];

const USAGE = `usage: pregen-chapters.ts [--ch all|1,2] [--style skins|<id>] [--dry-run]
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

async function main(): Promise<void> {
  if (flag("--help") || flag("-h")) {
    console.log(USAGE);
    return;
  }
  const dryRun = flag("--dry-run");

  // Names only on failure, never values.
  const rawUrl = usable(process.env.UPSTASH_REDIS_REST_URL) ?? usable(process.env.KV_REST_API_URL);
  const rawToken =
    usable(process.env.UPSTASH_REDIS_REST_TOKEN) ?? usable(process.env.KV_REST_API_TOKEN);
  const url = rawUrl?.startsWith("https://") ? rawUrl : undefined;
  const missing = [
    url ? null : "UPSTASH_REDIS_REST_URL|KV_REST_API_URL",
    rawToken ? null : "UPSTASH_REDIS_REST_TOKEN|KV_REST_API_TOKEN",
    usable(process.env.BLOB_READ_WRITE_TOKEN) ? null : "BLOB_READ_WRITE_TOKEN",
    usable(process.env.META_API_KEY) ? null : "META_API_KEY",
  ].filter((m): m is string => m !== null);
  if (missing.length > 0) {
    console.error(`missing image env: ${missing.join(",")}`);
    process.exit(1);
  }
  const capMicro = Math.round(parseCapUsd(process.env.SPEND_CAP_USD, 10) * 1_000_000);
  const dailyCapMicro = Math.round(parseCapUsd(process.env.DAILY_SPEND_CAP_USD, 2) * 1_000_000);

  const { book, scenes } = await loadBook("oz");
  const known = new Map(book.chapters.map((c) => [c.ch, c.title]));
  const chArg = opt("--ch") ?? "all";
  const wantCh =
    chArg === "all"
      ? [...known.keys()].sort((a, b) => a - b)
      : chArg.split(",").map((s) => Number(s.trim()));
  for (const ch of wantCh) {
    if (!Number.isInteger(ch) || !known.has(ch)) {
      console.error(`unknown chapter: ${chArg} (book has ${[...known.keys()].sort((a, b) => a - b).join(",")})`);
      process.exit(1);
    }
  }
  const styleArg = opt("--style") ?? "skins";
  const wantStyles =
    styleArg === "skins" ? SKIN_STYLE_IDS : SKIN_STYLE_IDS.filter((id) => id === styleArg);
  if (wantStyles.length === 0) {
    console.error(`unknown style: ${styleArg} (one of: skins, ${SKIN_STYLE_IDS.join(", ")})`);
    process.exit(1);
  }

  const kv = createRestKV(url as string, rawToken as string);
  const store = createBlobStore();
  const generate = createMetaClient(process.env.META_API_KEY as string);
  const day = utcDay();
  const cost = imageCostMicro();
  let cached = 0;
  let generated = 0;
  let failed = 0;
  let planned = 0;

  for (const ch of wantCh) {
    for (const styleId of wantStyles) {
      const style = parseStyleChoice({ preset: styleId });
      const key = imageKey({
        kind: "chapter",
        bookId: book.id,
        textVersion: book.textVersion,
        ch,
        reachedCh: ch,
        ...(style === undefined ? {} : { style }),
      });
      const indexKey = indexKeyFor(key);
      const hit = await kv.get(indexKey);
      if (hit) {
        cached++;
        console.log(`ch ${ch} ${styleId} cached ${hit}`);
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
        console.log(`ch ${ch} ${styleId} cached ${blobUrl}`);
        continue;
      }
      if (dryRun) {
        planned++;
        console.log(`ch ${ch} ${styleId} planned`);
        continue;
      }
      const spent = await reserveSpend(kv, {
        amountMicro: cost,
        day,
        spendCapMicro: capMicro,
        dailySpendCapMicro: dailyCapMicro,
      });
      if (!spent.ok) {
        console.log(
          spent.which === "total"
            ? `Stopped: spend cap reached at ch ${ch} ${styleId}, reserve refunded.`
            : `Stopped: daily spend cap reached at ch ${ch} ${styleId}, reserve refunded.`,
        );
        process.exitCode = 1;
        return;
      }
      const refund = (): Promise<void> => spent.reservation.release();
      let bytes: Uint8Array;
      try {
        bytes = await generate.generate(buildPregenChapterPrompt({ book, scenes, ch, style }));
      } catch {
        await refund();
        failed++;
        console.log(`ch ${ch} ${styleId} failed -`);
        continue;
      }
      let saved: string;
      try {
        saved = await store.save(key, bytes);
      } catch {
        await refund();
        failed++;
        console.log(`ch ${ch} ${styleId} failed -`);
        continue;
      }
      try {
        await kv.set(indexKey, saved);
      } catch {
        // The file exists; the next run backfills the index.
      }
      generated++;
      console.log(`ch ${ch} ${styleId} generated ${saved}`);
    }
  }

  if (dryRun) {
    console.log(`Planned: ${planned} pages (${cached} cached), expected ${usd(planned * cost)}.`);
  } else {
    console.log(
      `Total: ${cached + generated + failed} pages (${cached} cached, ${generated} generated, ${failed} failed). Spent ${usd(generated * cost)}.`,
    );
  }
}

try {
  await main();
} catch (e) {
  console.error(`pregen failed: ${e instanceof Error ? e.message : "unknown"}`);
  process.exit(1);
}
