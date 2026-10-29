import "server-only";
import { randomUUID } from "node:crypto";
import {
  DAILY_SPEND_TTL_SEC,
  MSG_FAILED,
  MSG_QUOTA,
  MSG_CREDITS_OUT,
  LOCK_TTL_SEC,
  buildCaption,
  buildPrompt,
  budgetExceeded,
  dailySpendKey,
  imageCostMicro,
  imageKey,
  indexKeyFor,
  lockKeyFor,
  spendKey,
} from "@/core/images";
import type { ImageGenerator, ImageRequest, ImageResponse, ImageStore, KV } from "@/core/images";
import { addRange, parseRanges, pickReusable, rangeListKeyFor } from "@/core/image-ranges";
import type { ParaRange } from "@/core/image-ranges";
import { buildChapterPrompt } from "@/core/panels";
import type { ImageEnv } from "./env";
import { errorTag } from "./errors";
import { verifyHuman } from "./human";
import { checkQuota, hashIp, quotaKeysFor, refundQuota } from "./quota";

export interface ImageContent {
  passageText: string;
  sceneTitle: string;
  sceneClip: string;
  // Chapter pages only: the panel descriptions, built server-side from
  // the chapter's scene summaries. sceneTitle carries the chapter title.
  chapterPanels?: { description: string }[];
}

export interface OrchestrateDeps {
  kv: KV;
  store: ImageStore;
  generate: ImageGenerator;
  env: ImageEnv;
  content: ImageContent;
  ip: string;
  anonId: string;
  day: string;
  token?: string;
  // Scene holding the selection start; "" skips range reuse.
  sceneId: string;
}

// One pass, no skipped steps: hit -> lock -> human -> quota -> budget ->
// generate -> store -> index -> release. Every failure after the reserve
// refunds quota, budget, and the daily counter and releases the lock.
export async function orchestrate(
  req: ImageRequest,
  deps: OrchestrateDeps,
): Promise<ImageResponse> {
  const key = imageKey(req);
  const indexKey = indexKeyFor(key);
  const lockKey = lockKeyFor(key);
  // deps.day is the UTC day string (YYYY-MM-DD), shared with quota keys.
  const dailyKey = dailySpendKey(deps.day);

  // Passage range reuse: an overlapping cached selection serves this one.
  // Scene requests and unknown scenes skip all of it.
  let want: ParaRange | null = null;
  let rangesAt = "";
  let rangeList: ParaRange[] = [];
  if (req.kind === "passage" && deps.sceneId !== "") {
    want = { start: req.n, end: req.endN ?? req.n };
    rangesAt = rangeListKeyFor(req, deps.sceneId);
    rangeList = parseRanges(await deps.kv.get(rangesAt));
  }
  // shortcut: GET+SET can drop a concurrent append, which only costs a future reuse; upgrade to a Redis list if that matters.
  const recordRange = async (): Promise<void> => {
    const self = want;
    if (!self || rangeList.some((r) => r.start === self.start && r.end === self.end)) return;
    try {
      await deps.kv.set(rangesAt, JSON.stringify(addRange(rangeList, self)));
    } catch {
      console.error("image range index failed");
    }
  };

  const indexed = await deps.kv.get(indexKey);
  if (indexed) {
    // Pictures cached before range reuse join the list on their next hit.
    await recordRange();
    return { status: "ready", url: indexed, cached: true, caption: captionFor(req, deps.content) };
  }

  if (req.kind === "passage" && want) {
    const self = want;
    const best = pickReusable(
      rangeList.filter((r) => r.start !== self.start || r.end !== self.end),
      self,
    );
    if (best) {
      const bestKey = imageKey({ ...req, n: best.start, endN: best.end });
      const bestIndex = indexKeyFor(bestKey);
      let hit = await deps.kv.get(bestIndex);
      if (!hit) {
        hit = await deps.store.findUrl(bestKey);
        if (hit) await deps.kv.set(bestIndex, hit);
      }
      if (hit) {
        return { status: "ready", url: hit, cached: true, caption: captionFor(req, deps.content) };
      }
    }
  }
  const existing = await deps.store.findUrl(key);
  if (existing) {
    await deps.kv.set(indexKey, existing);
    await recordRange();
    return { status: "ready", url: existing, cached: true, caption: captionFor(req, deps.content) };
  }

  const token = deps.token ?? randomUUID();
  if (!(await deps.kv.setNxEx(lockKey, token, LOCK_TTL_SEC))) return { status: "pending" };

  // Best-effort unlock: a release failure must never turn into a client 500.
  const release = async (): Promise<void> => {
    try {
      await deps.kv.releaseIfToken(lockKey, token);
    } catch {
      // Lock expires on its own; nothing to do.
    }
  };

  const keys = quotaKeysFor({ day: deps.day, ip: deps.ip, salt: deps.env.ipSalt, anonId: deps.anonId });
  let quotaTaken = false;
  let spendTaken = false;
  let dailySpendTaken = false;
  // Best-effort refunds that clear their flag only after the write lands,
  // so the outer catch refunds each reserve exactly once.
  const refundQuotaOnce = async (): Promise<void> => {
    try {
      await refundQuota(deps.kv, keys);
      quotaTaken = false;
    } catch {
      // Redis down: nothing reserved server-side to retry against.
    }
  };
  const refundSpendOnce = async (): Promise<void> => {
    try {
      await deps.kv.decrBy(spendKey(), imageCostMicro());
      spendTaken = false;
    } catch {
      // Redis down: nothing reserved server-side to retry against.
    }
  };
  const refundDailySpendOnce = async (): Promise<void> => {
    try {
      await deps.kv.decrBy(dailyKey, imageCostMicro());
      dailySpendTaken = false;
    } catch {
      // Redis down: nothing reserved server-side to retry against.
    }
  };

  try {
    if (!verifyHuman()) {
      await release();
      return { status: "error", code: "unavailable", message: MSG_FAILED };
    }

    if (!(await checkQuota(deps.kv, keys)).ok) {
      await release();
      return { status: "error", code: "quota", message: MSG_QUOTA };
    }
    quotaTaken = true;

    // Both caps apply only to requests paid with our key. The future
    // BYOK path must skip these reserves and check its own key instead.
    const total = await deps.kv.incrBy(spendKey(), imageCostMicro());
    spendTaken = true;
    if (budgetExceeded(total, deps.env.spendCapMicro)) {
      await refundSpendOnce();
      await refundQuotaOnce();
      await release();
      return { status: "error", code: "budget", message: MSG_CREDITS_OUT };
    }

    const dailyTotal = await deps.kv.incrBy(dailyKey, imageCostMicro());
    dailySpendTaken = true;
    // Refresh the expiry on every reserve: cheap, idempotent, and keeps
    // the key alive through a busy day without a separate read.
    await deps.kv.expire(dailyKey, DAILY_SPEND_TTL_SEC);
    if (budgetExceeded(dailyTotal, deps.env.dailySpendCapMicro)) {
      await refundDailySpendOnce();
      await refundSpendOnce();
      await refundQuotaOnce();
      await release();
      return { status: "error", code: "daily_budget", message: MSG_CREDITS_OUT };
    }

    let bytes: Uint8Array;
    try {
      bytes = await deps.generate.generate(
        req.kind === "chapter"
          ? buildChapterPrompt({
              chapterTitle: deps.content.sceneTitle,
              panels: deps.content.chapterPanels ?? [],
              style: req.style,
            })
          : buildPrompt({
              kind: req.kind,
              passageText: deps.content.passageText,
              sceneTitle: deps.content.sceneTitle,
              sceneClip: deps.content.sceneClip,
              style: req.style,
            }),
      );
    } catch (e) {
      await refundDailySpendOnce();
      await refundSpendOnce();
      await refundQuotaOnce();
      await release();
      console.error(`image generate failed: ${errorTag(e)}`);
      return { status: "error", code: "unavailable", message: MSG_FAILED };
    }

    try {
      const url = await deps.store.save(key, bytes);
      try {
        await deps.kv.set(indexKey, url);
      } catch {
        console.error("image index failed");
        await recordRange();
        await release();
        return { status: "ready", url, cached: false, caption: captionFor(req, deps.content) };
      }
      await recordRange();
      await release();
      return { status: "ready", url, cached: false, caption: captionFor(req, deps.content) };
    } catch (e) {
      // A lost save race leaves the winner's file behind; backfill from it.
      const raced = await deps.store.findUrl(key);
      if (raced) {
        try {
          await deps.kv.set(indexKey, raced);
        } catch {
          console.error("image index failed");
        }
        await recordRange();
        await release();
        return { status: "ready", url: raced, cached: true, caption: captionFor(req, deps.content) };
      }
      await refundDailySpendOnce();
      await refundSpendOnce();
      await refundQuotaOnce();
      await release();
      console.error(`image store failed: ${errorTag(e)}`);
      return { status: "error", code: "unavailable", message: MSG_FAILED };
    }
  } catch (e) {
    if (dailySpendTaken) await refundDailySpendOnce();
    if (spendTaken) await refundSpendOnce();
    if (quotaTaken) await refundQuotaOnce();
    await release();
    console.error(`image request failed: ${errorTag(e)}`);
    return { status: "error", code: "unavailable", message: MSG_FAILED };
  }
}

function captionFor(req: ImageRequest, content: ImageContent): string {
  return buildCaption({
    kind: req.kind,
    sceneTitle: content.sceneTitle,
    passageText: content.passageText,
  });
}
