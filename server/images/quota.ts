import "server-only";
import { createHmac } from "node:crypto";
import { QUOTA_TTL_SEC, overQuota, quotaKeys } from "@/core/images";
import type { KV } from "@/core/images";

// Per-person quota: 5 new images per day, counted by hashed IP and by
// anonymous cookie, whichever runs out first. Day keys are UTC dates.
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function hashIp(ip: string, salt: string): string {
  return createHmac("sha256", salt).update(ip).digest("hex");
}

export function clientIp(forwardedFor: string | null | undefined): string {
  return (forwardedFor ?? "").split(",")[0]?.trim() || "unknown";
}

export async function checkQuota(
  kv: KV,
  keys: { ip: string; anon: string },
): Promise<{ ok: true } | { ok: false }> {
  const ipCount = await kv.incr(keys.ip);
  await kv.expire(keys.ip, QUOTA_TTL_SEC);
  const anonCount = await kv.incr(keys.anon);
  await kv.expire(keys.anon, QUOTA_TTL_SEC);
  if (overQuota(ipCount) || overQuota(anonCount)) {
    await kv.decr(keys.ip);
    await kv.decr(keys.anon);
    return { ok: false };
  }
  return { ok: true };
}

export async function refundQuota(kv: KV, keys: { ip: string; anon: string }): Promise<void> {
  await kv.decr(keys.ip);
  await kv.decr(keys.anon);
}

export function quotaKeysFor(args: { day: string; ip: string; salt: string; anonId: string }): {
  ip: string;
  anon: string;
} {
  return quotaKeys({ day: args.day, ipHash: hashIp(args.ip, args.salt), anonId: args.anonId });
}
