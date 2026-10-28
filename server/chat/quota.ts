import "server-only";
import type { KV } from "@/core/images";

// Per-person question quota, counted by hashed IP and by the anonymous
// cookie, whichever runs out first. Day keys are UTC dates.
export const CHAT_QUOTA_TTL_SEC = 48 * 3600;

export async function takeChatQuota(
  kv: KV,
  keys: { ip: string; anon: string },
  limit: number,
): Promise<{ ok: true; ipCount: number; anonCount: number } | { ok: false }> {
  const ipCount = await kv.incr(keys.ip);
  await kv.expire(keys.ip, CHAT_QUOTA_TTL_SEC);
  const anonCount = await kv.incr(keys.anon);
  await kv.expire(keys.anon, CHAT_QUOTA_TTL_SEC);
  if (ipCount > limit || anonCount > limit) {
    await kv.decr(keys.ip);
    await kv.decr(keys.anon);
    return { ok: false };
  }
  return { ok: true, ipCount, anonCount };
}

// Best effort: a Redis failure here must never become a client 500.
export async function refundChatQuota(kv: KV, keys: { ip: string; anon: string }): Promise<void> {
  try {
    await kv.decr(keys.ip);
    await kv.decr(keys.anon);
  } catch {
    // Redis down: nothing reserved server-side to retry against.
  }
}
