import "server-only";
import type { KV } from "@/core/types";
import { hashIp, ipBucket } from "./request";

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
  let ipTaken = false;
  let anonTaken = false;
  try {
    const ipCount = await kv.incr(keys.ip);
    ipTaken = true;
    await kv.expire(keys.ip, opts.ttlSec);
    const anonCount = await kv.incr(keys.anon);
    anonTaken = true;
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
  } catch (e) {
    // A Redis failure between increments gives back what landed, so a
    // timeout never leaks quota. Best effort, then the caller maps it.
    if (anonTaken) {
      try {
        await kv.decr(keys.anon);
      } catch {
        // The increment already landed; the TTL bounds the damage.
      }
    }
    if (ipTaken) {
      try {
        await kv.decr(keys.ip);
      } catch {
        // The increment already landed; the TTL bounds the damage.
      }
    }
    throw e;
  }
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

// Free uploaded-book processing: two books per person per UTC day,
// counted on hashed IP and the anon cookie, whichever hits first.
export const FREE_BOOKS_PER_PERSON = 2;
export const BOOK_QUOTA_TTL_SEC = 48 * 3600;

export function bookQuotaKeys(args: { day: string; ipHash: string; anonId: string }): DualKeys {
  return {
    ip: `books:quota:ip:${args.day}:${args.ipHash}`,
    anon: `books:quota:anon:${args.day}:${args.anonId}`,
  };
}

export function bookQuotaKeysFor(args: { day: string; ip: string; salt: string; anonId: string }): DualKeys {
  return bookQuotaKeys({
    day: args.day,
    ipHash: hashIp(ipBucket(args.ip, args.anonId), args.salt),
    anonId: args.anonId,
  });
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
