import { describe, expect, it } from "vitest";
import { clientIp, hashIp, ipBucket, utcDay } from "./request";

function headers(entries: [string, string][]): Headers {
  const out = new Headers();
  for (const [name, value] of entries) out.set(name, value);
  return out;
}

describe("request helpers", () => {
  it("formats the UTC day", () => {
    expect(utcDay(new Date("2026-10-27T23:59:59Z"))).toBe("2026-10-27");
    expect(utcDay(new Date("2026-10-28T00:00:01Z"))).toBe("2026-10-28");
  });

  it("hashes the IP with the salt", () => {
    expect(hashIp("1.2.3.4", "salt")).toBe(hashIp("1.2.3.4", "salt"));
    expect(hashIp("1.2.3.4", "salt")).not.toBe(hashIp("1.2.3.4", "other"));
    expect(hashIp("1.2.3.4", "salt")).not.toBe(hashIp("9.9.9.9", "salt"));
  });

  it("buckets a known IP unchanged and scopes unknown to the anon cookie", () => {
    expect(ipBucket("1.2.3.4", "anon-1")).toBe("1.2.3.4");
    expect(ipBucket("unknown", "anon-1")).toBe("unknown:anon-1");
    expect(ipBucket("unknown", "anon-1")).not.toBe(ipBucket("unknown", "anon-2"));
  });

  it("prefers the platform headers over x-forwarded-for", () => {
    expect(
      clientIp(headers([["x-vercel-forwarded-for", "1.1.1.1"], ["x-real-ip", "2.2.2.2"], ["x-forwarded-for", "3.3.3.3"]])),
    ).toBe("1.1.1.1");
    expect(clientIp(headers([["x-real-ip", "2.2.2.2"], ["x-forwarded-for", "3.3.3.3"]]))).toBe("2.2.2.2");
    expect(clientIp(headers([["x-forwarded-for", "3.3.3.3"]]))).toBe("3.3.3.3");
  });

  it("takes the first forwarded entry and trims it", () => {
    expect(clientIp(headers([["x-forwarded-for", "1.2.3.4, 5.6.7.8"]]))).toBe("1.2.3.4");
    expect(clientIp(headers([["x-forwarded-for", "  1.2.3.4  "]]))).toBe("1.2.3.4");
  });

  it("falls through invalid values to unknown", () => {
    expect(clientIp(headers([]))).toBe("unknown");
    expect(clientIp(headers([["x-forwarded-for", ""]]))).toBe("unknown");
    expect(clientIp(headers([["x-forwarded-for", "1.2.3.4, 5.6.7.8, "]]))).toBe("1.2.3.4");
    // Spaces never belong in one IP: skip to the next header.
    expect(clientIp(headers([["x-vercel-forwarded-for", "not an ip"], ["x-real-ip", "2.2.2.2"]]))).toBe("2.2.2.2");
    // An overlong value is a placeholder, never an address.
    expect(
      clientIp(headers([["x-real-ip", "1".repeat(65)], ["x-forwarded-for", "3.3.3.3"]])),
    ).toBe("3.3.3.3");
    expect(clientIp(headers([["x-forwarded-for", "1.2.3.4,5.6.7.8"]]))).toBe("1.2.3.4");
  });
});
