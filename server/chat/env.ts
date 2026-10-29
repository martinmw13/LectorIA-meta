import "server-only";
import { usable } from "@/server/guard/env";

// Same names as readImageEnv minus BLOB_READ_WRITE_TOKEN, plus the
// optional Turnstile secret: without it the route skips the human check
// (dev) instead of failing. Missing required env means 503 unavailable.
export interface ChatEnv {
  upstashUrl: string;
  upstashToken: string;
  metaKey: string;
  sessionSecret: string;
  ipSalt: string;
  spendCapMicro: number;
  dailySpendCapMicro: number;
  turnstileSecret?: string;
}

const URL_NAMES = "UPSTASH_REDIS_REST_URL|KV_REST_API_URL";
const TOKEN_NAMES = "UPSTASH_REDIS_REST_TOKEN|KV_REST_API_TOKEN";

const REQUIRED = ["META_API_KEY", "SESSION_SECRET", "IP_HASH_SALT"] as const;

function parseCapUsd(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function readChatEnv(from: NodeJS.ProcessEnv = process.env): ChatEnv {
  const candidate = usable(from.UPSTASH_REDIS_REST_URL) ?? usable(from.KV_REST_API_URL);
  const upstashUrl = candidate?.startsWith("https://") ? candidate : undefined;
  const upstashToken = usable(from.UPSTASH_REDIS_REST_TOKEN) ?? usable(from.KV_REST_API_TOKEN);
  const missing = [
    upstashUrl ? null : URL_NAMES,
    upstashToken ? null : TOKEN_NAMES,
    ...REQUIRED.filter((k) => !usable(from[k])),
  ].filter((m): m is string => m !== null);
  if (missing.length > 0) throw new Error(`missing chat env: ${missing.join(",")}`);
  return {
    upstashUrl: upstashUrl as string,
    upstashToken: upstashToken as string,
    metaKey: from.META_API_KEY as string,
    sessionSecret: from.SESSION_SECRET as string,
    ipSalt: from.IP_HASH_SALT as string,
    spendCapMicro: Math.round(parseCapUsd(from.SPEND_CAP_USD, 10) * 1_000_000),
    dailySpendCapMicro: Math.round(parseCapUsd(from.DAILY_SPEND_CAP_USD, 2) * 1_000_000),
    ...(from.TURNSTILE_SECRET_KEY ? { turnstileSecret: from.TURNSTILE_SECRET_KEY } : {}),
  };
}
