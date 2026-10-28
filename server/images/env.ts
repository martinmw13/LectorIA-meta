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
}

const REQUIRED = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "BLOB_READ_WRITE_TOKEN",
  "META_API_KEY",
  "SESSION_SECRET",
  "IP_HASH_SALT",
] as const;

export function readImageEnv(from: NodeJS.ProcessEnv = process.env): ImageEnv {
  const missing = REQUIRED.filter((k) => !from[k]);
  if (missing.length > 0) throw new Error(`missing image env: ${missing.join(",")}`);
  const capUsd = Number(from.SPEND_CAP_USD ?? "10");
  return {
    upstashUrl: from.UPSTASH_REDIS_REST_URL as string,
    upstashToken: from.UPSTASH_REDIS_REST_TOKEN as string,
    metaKey: from.META_API_KEY as string,
    sessionSecret: from.SESSION_SECRET as string,
    ipSalt: from.IP_HASH_SALT as string,
    spendCapMicro: Math.round((Number.isFinite(capUsd) ? capUsd : 10) * 1_000_000),
  };
}
