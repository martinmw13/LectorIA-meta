import "server-only";
import { randomUUID } from "node:crypto";
import {
  DAILY_SPEND_TTL_SEC,
  MSG_FAILED,
  MSG_QUOTA,
  MSG_BUDGET_TOTAL,
  MSG_BUDGET_DAILY,
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
import type { ImageEnv } from "./env";
import { verifyHuman } from "./human";
import { checkQuota, hashIp, quotaKeysFor, refundQuota } from "./quota";

export interface ImageContent {
  passageText: string;
  sceneTitle: string;
  sceneClip: string;
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
}

// One pass, no skipped steps: hit -> lock -> human -> quota -> budget ->
// generate -> store -> index -> release. Every failure after the reserve
// refunds quota and budget and releases the lock.
export async function orchestrate(
  req: ImageRequest,
  deps: OrchestrateDeps,
): Promise<ImageResponse> {
  const key = imageKey(req);
  const indexKey = indexKeyFor(key);
  const lockKey = lockKeyFor(key);
  // deps.day is the UTC day string (YYYY-MM-DD), shared with quota keys.
  const dailyKey = dailySpendKey(deps.day);

  const indexed = await deps.kv.get(indexKey);
  if (indexed) {
    return { status: "ready", url: indexed, cached: true, caption: captionFor(req, deps.content) };
  }
  const existing = await deps.store.findUrl(key);
  if (existing) {
    await deps.kv.set(indexKey, existing);
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
      return { status: "error", code: "budget", message: MSG_BUDGET_TOTAL };
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
      return { status: "error", code: "daily_budget", message: MSG_BUDGET_DAILY };
    }

    let bytes: Uint8Array;
    try {
      bytes = await deps.generate.generate(
        buildPrompt({
          kind: req.kind,
          passageText: deps.content.passageText,
          sceneTitle: deps.content.sceneTitle,
          sceneClip: deps.content.sceneClip,
        }),
      );
    } catch {
      await refundDailySpendOnce();
      await refundSpendOnce();
      await refundQuotaOnce();
      await release();
      console.error("image generate failed");
      return { status: "error", code: "unavailable", message: MSG_FAILED };
    }

    try {
      const url = await deps.store.save(key, bytes);
      try {
        await deps.kv.set(indexKey, url);
      } catch {
        console.error("image index failed");
        await release();
        return { status: "ready", url, cached: false, caption: captionFor(req, deps.content) };
      }
      await release();
      return { status: "ready", url, cached: false, caption: captionFor(req, deps.content) };
    } catch {
      // A lost save race leaves the winner's file behind; backfill from it.
      const raced = await deps.store.findUrl(key);
      if (raced) {
        try {
          await deps.kv.set(indexKey, raced);
        } catch {
          console.error("image index failed");
        }
        await release();
        return { status: "ready", url: raced, cached: true, caption: captionFor(req, deps.content) };
      }
      await refundDailySpendOnce();
      await refundSpendOnce();
      await refundQuotaOnce();
      await release();
      console.error("image store failed");
      return { status: "error", code: "unavailable", message: MSG_FAILED };
    }
  } catch {
    if (dailySpendTaken) await refundDailySpendOnce();
    if (spendTaken) await refundSpendOnce();
    if (quotaTaken) await refundQuotaOnce();
    await release();
    console.error("image request failed");
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
