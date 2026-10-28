import "server-only";

// Reads image env once per request. Any missing key means unavailable:
// with no quotas or budget configured, the route must never spend.
export interface ImageEnv {
  upstashUrl: string;
  upstashToken: string;
  metaKey: string;
  sessionSecret: string;
  ipSalt: string;
  spendCapMicro: number;
  dailySpendCapMicro: number;
}

// Vercel's Upstash marketplace integration injects KV_REST_API_* names.
// UPSTASH_* wins when non-empty, else the KV_* fallback applies per value.
// The read-only token is never used (we write).
const URL_NAMES = "UPSTASH_REDIS_REST_URL|KV_REST_API_URL";
const TOKEN_NAMES = "UPSTASH_REDIS_REST_TOKEN|KV_REST_API_TOKEN";

const REQUIRED = [
  "BLOB_READ_WRITE_TOKEN",
  "META_API_KEY",
  "SESSION_SECRET",
  "IP_HASH_SALT",
] as const;

// One rule for both caps: a finite, non-negative USD value wins,
// anything else (missing, non-numeric, negative, Infinity) falls back.
// Zero stays valid so a zero cap can intentionally block spend.
function parseCapUsd(raw: string | undefined, fallback: number): number {
  const value = Number(raw ?? String(fallback));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function readImageEnv(from: NodeJS.ProcessEnv = process.env): ImageEnv {
  const upstashUrl = from.UPSTASH_REDIS_REST_URL || from.KV_REST_API_URL;
  const upstashToken = from.UPSTASH_REDIS_REST_TOKEN || from.KV_REST_API_TOKEN;
  const missing = [
    upstashUrl ? null : URL_NAMES,
    upstashToken ? null : TOKEN_NAMES,
    ...REQUIRED.filter((k) => !from[k]),
  ].filter((m): m is string => m !== null);
  if (missing.length > 0) throw new Error(`missing image env: ${missing.join(",")}`);
  return {
    upstashUrl: upstashUrl as string,
    upstashToken: upstashToken as string,
    metaKey: from.META_API_KEY as string,
    sessionSecret: from.SESSION_SECRET as string,
    ipSalt: from.IP_HASH_SALT as string,
    spendCapMicro: Math.round(parseCapUsd(from.SPEND_CAP_USD, 10) * 1_000_000),
    dailySpendCapMicro: Math.round(parseCapUsd(from.DAILY_SPEND_CAP_USD, 2) * 1_000_000),
  };
}
