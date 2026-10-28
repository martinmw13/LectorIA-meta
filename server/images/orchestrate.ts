import "server-only";
import { randomUUID } from "node:crypto";
import {
  MSG_FAILED,
  MSG_QUOTA,
  MSG_BUDGET,
  LOCK_TTL_SEC,
  buildCaption,
  buildPrompt,
  budgetExceeded,
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

    const total = await deps.kv.incrBy(spendKey(), imageCostMicro());
    spendTaken = true;
    if (budgetExceeded(total, deps.env.spendCapMicro)) {
      await refundSpendOnce();
      await refundQuotaOnce();
      await release();
      return { status: "error", code: "budget", message: MSG_BUDGET };
    }

    let bytes: Uint8Array;
    try {
      bytes = await deps.generate.generate(
        buildPrompt({
          kind: req.kind,
          passageText: deps.content.passageText,
          sceneTitle: deps.content.sceneTitle,
          sceneClip: deps.content.sceneClip,
          style: req.style,
        }),
      );
    } catch {
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
      await refundSpendOnce();
      await refundQuotaOnce();
      await release();
      console.error("image store failed");
      return { status: "error", code: "unavailable", message: MSG_FAILED };
    }
  } catch {
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
