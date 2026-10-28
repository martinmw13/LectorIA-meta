import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readImageEnv } from "./env";

const BASE = {
  BLOB_READ_WRITE_TOKEN: "test-blob",
  META_API_KEY: "test-meta",
  SESSION_SECRET: "test-session",
  IP_HASH_SALT: "test-salt",
} as const;

const REDIS_KEYS = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "KV_REST_API_READ_ONLY_TOKEN",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of [...Object.keys(BASE), ...REDIS_KEYS, "SPEND_CAP_USD", "DAILY_SPEND_CAP_USD"]) {
    saved[k] = process.env[k];
  }
  Object.assign(process.env, BASE);
  for (const k of [...REDIS_KEYS, "SPEND_CAP_USD", "DAILY_SPEND_CAP_USD"]) delete process.env[k];
});

afterEach(() => {
  for (const k of Object.keys(saved)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("readImageEnv redis fallback", () => {
  it("prefers UPSTASH_* when both are set", () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://upstash-url";
    process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token";
    process.env.KV_REST_API_URL = "https://kv-url";
    process.env.KV_REST_API_TOKEN = "kv-token";
    const env = readImageEnv();
    expect(env.upstashUrl).toBe("https://upstash-url");
    expect(env.upstashToken).toBe("upstash-token");
  });

  it("uses KV_REST_API_* when UPSTASH_* is absent", () => {
    process.env.KV_REST_API_URL = "https://kv-url";
    process.env.KV_REST_API_TOKEN = "kv-token";
    const env = readImageEnv();
    expect(env.upstashUrl).toBe("https://kv-url");
    expect(env.upstashToken).toBe("kv-token");
  });

  it("uses KV_REST_API_* when UPSTASH_* is empty", () => {
    process.env.UPSTASH_REDIS_REST_URL = "";
    process.env.UPSTASH_REDIS_REST_TOKEN = "";
    process.env.KV_REST_API_URL = "https://kv-url";
    process.env.KV_REST_API_TOKEN = "kv-token";
    const env = readImageEnv();
    expect(env.upstashUrl).toBe("https://kv-url");
    expect(env.upstashToken).toBe("kv-token");
  });

  it("falls back each value independently", () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://upstash-url";
    process.env.KV_REST_API_TOKEN = "kv-token";
    const env = readImageEnv();
    expect(env.upstashUrl).toBe("https://upstash-url");
    expect(env.upstashToken).toBe("kv-token");
  });

  it("does not accept the read-only token alone", () => {
    process.env.KV_REST_API_URL = "https://kv-url";
    process.env.KV_REST_API_READ_ONLY_TOKEN = "read-only-token";
    expect(() => readImageEnv()).toThrow(
      "UPSTASH_REDIS_REST_TOKEN|KV_REST_API_TOKEN",
    );
  });

  it("defaults the daily spend cap to 2 USD", () => {
    delete process.env.DAILY_SPEND_CAP_USD;
    process.env.UPSTASH_REDIS_REST_URL = "https://upstash-url";
    process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token";
    expect(readImageEnv().dailySpendCapMicro).toBe(2_000_000);
  });

  it("honors a finite non-negative DAILY_SPEND_CAP_USD", () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://upstash-url";
    process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token";
    process.env.DAILY_SPEND_CAP_USD = "3";
    expect(readImageEnv().dailySpendCapMicro).toBe(3_000_000);
  });

  it.each(["abc", "-3", "Infinity", "", "  "])(
    "falls back to 2 USD for %s",
    (value) => {
      process.env.UPSTASH_REDIS_REST_URL = "https://upstash-url";
      process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token";
      process.env.DAILY_SPEND_CAP_USD = value;
      expect(readImageEnv().dailySpendCapMicro).toBe(2_000_000);
    },
  );

  it("defaults the total spend cap to 10 USD", () => {
    delete process.env.SPEND_CAP_USD;
    process.env.UPSTASH_REDIS_REST_URL = "https://upstash-url";
    process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token";
    expect(readImageEnv().spendCapMicro).toBe(10_000_000);
  });

  it("honors a finite non-negative SPEND_CAP_USD", () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://upstash-url";
    process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token";
    process.env.SPEND_CAP_USD = "3";
    expect(readImageEnv().spendCapMicro).toBe(3_000_000);
  });

  it.each(["abc", "-3", "Infinity", "", "  "])(
    "falls back to 10 USD for total cap %s",
    (value) => {
      process.env.UPSTASH_REDIS_REST_URL = "https://upstash-url";
      process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token";
      process.env.SPEND_CAP_USD = value;
      expect(readImageEnv().spendCapMicro).toBe(10_000_000);
    },
  );

  it("missing-env error lists names only, never values", () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://secret-url-value";
    let message = "";
    try {
      readImageEnv();
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("UPSTASH_REDIS_REST_TOKEN|KV_REST_API_TOKEN");
    expect(message).not.toContain("secret-url-value");
  });
});
