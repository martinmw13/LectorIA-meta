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
  const release = () => deps.kv.releaseIfToken(lockKey, token);

  if (!verifyHuman()) {
    await release();
    return { status: "error", code: "unavailable", message: MSG_FAILED };
  }

  const keys = quotaKeysFor({ day: deps.day, ip: deps.ip, salt: deps.env.ipSalt, anonId: deps.anonId });
  if (!(await checkQuota(deps.kv, keys)).ok) {
    await release();
    return { status: "error", code: "quota", message: MSG_QUOTA };
  }

  const total = await deps.kv.incrBy(spendKey(), imageCostMicro());
  if (budgetExceeded(total, deps.env.spendCapMicro)) {
    await deps.kv.decrBy(spendKey(), imageCostMicro());
    await refundQuota(deps.kv, keys);
    await release();
    return { status: "error", code: "budget", message: MSG_BUDGET };
  }
  const refundSpend = () => deps.kv.decrBy(spendKey(), imageCostMicro());

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
    await refundSpend();
    await refundQuota(deps.kv, keys);
    await release();
    console.error("image generate failed");
    return { status: "error", code: "unavailable", message: MSG_FAILED };
  }

  try {
    const url = await deps.store.save(key, bytes);
    await deps.kv.set(indexKey, url);
    await release();
    return { status: "ready", url, cached: false, caption: captionFor(req, deps.content) };
  } catch {
    // A lost save race leaves the winner's file behind; backfill from it.
    const raced = await deps.store.findUrl(key);
    if (raced) {
      await deps.kv.set(indexKey, raced);
      await release();
      return { status: "ready", url: raced, cached: true, caption: captionFor(req, deps.content) };
    }
    await refundSpend();
    await refundQuota(deps.kv, keys);
    await release();
    console.error("image store failed");
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
