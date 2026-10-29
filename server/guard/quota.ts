import "server-only";
import type { KV } from "@/core/types";
import { hashIp } from "./request";

// Per-person quota, counted by hashed IP and by the anonymous
// cookie, whichever runs out first. Day keys are UTC dates.
export const CHAT_QUOTA_TTL_SEC = 48 * 3600;

export interface DualKeys {
  ip: string;
  anon: string;
}

export async function takeDualQuota(
  kv: KV,
  keys: DualKeys,
  opts: { limit: number; ttlSec: number },
): Promise<{ ok: true; ipCount: number; anonCount: number } | { ok: false }> {
  const ipCount = await kv.incr(keys.ip);
  await kv.expire(keys.ip, opts.ttlSec);
  const anonCount = await kv.incr(keys.anon);
  await kv.expire(keys.anon, opts.ttlSec);
  if (ipCount > opts.limit || anonCount > opts.limit) {
    // Compensating decrs are best effort: a Redis failure here must
    // neither throw nor leak the caller's counts, so each stands alone.
    try {
      await kv.decr(keys.ip);
    } catch {
      // The increment already landed; the TTL bounds the damage.
    }
    try {
      await kv.decr(keys.anon);
    } catch {
      // The increment already landed; the TTL bounds the damage.
    }
    return { ok: false };
  }
  return { ok: true, ipCount, anonCount };
}

// Best effort: a Redis failure here must never become a client 500.
export async function refundDualQuota(kv: KV, keys: DualKeys): Promise<void> {
  try {
    await kv.decr(keys.ip);
    await kv.decr(keys.anon);
  } catch {
    // Redis down: nothing reserved server-side to retry against.
  }
}

// Free uploaded-book processing: one book per person for the whole
// hackathon. Keys carry no day so the limit never resets; the TTL (~10
// days) only bounds Redis growth. No route or wiring yet, just the hook.
export const FREE_BOOKS_PER_PERSON = 1;
export const BOOK_QUOTA_TTL_SEC = 10 * 24 * 3600;

export function bookQuotaKeys(args: { ipHash: string; anonId: string }): DualKeys {
  return {
    ip: `books:quota:ip:${args.ipHash}`,
    anon: `books:quota:anon:${args.anonId}`,
  };
}

export function bookQuotaKeysFor(args: { ip: string; salt: string; anonId: string }): DualKeys {
  return bookQuotaKeys({ ipHash: hashIp(args.ip, args.salt), anonId: args.anonId });
}

// Thin wrapper so the book hook shares the never-throw compensation.
export async function checkBookQuota(
  kv: KV,
  keys: DualKeys,
): Promise<{ ok: true } | { ok: false }> {
  const taken = await takeDualQuota(kv, keys, {
    limit: FREE_BOOKS_PER_PERSON,
    ttlSec: BOOK_QUOTA_TTL_SEC,
  });
  return taken.ok ? { ok: true } : { ok: false };
}

export async function refundBookQuota(kv: KV, keys: DualKeys): Promise<void> {
  await refundDualQuota(kv, keys);
}
