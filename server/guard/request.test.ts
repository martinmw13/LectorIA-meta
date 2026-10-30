import { describe, expect, it } from "vitest";
import { clientIp, hashIp, ipBucket, rejectsCrossSite, utcDay } from "./request";

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

  it("buckets IPv6 by /64 prefix", () => {
    expect(ipBucket("2001:db8:abcd:12::1", "a")).toBe(ipBucket("2001:db8:abcd:12:ffff:ffff:ffff:ffff", "a"));
    expect(ipBucket("2001:db8:abcd:12::1", "a")).not.toBe(ipBucket("2001:db8:abcd:13::1", "a"));
    expect(ipBucket("2001:db8:abcd:12::1", "a")).toBe(ipBucket("2001:0db8:abcd:0012:0000:0000:0000:0001", "a"));
    expect(ipBucket("2001:DB8:ABCD:12::1", "a")).toBe("2001:0db8:abcd:0012::/64");
    expect(ipBucket("[2001:db8:abcd:12::1]", "a")).toBe("2001:0db8:abcd:0012::/64");
    expect(ipBucket("not an ip", "a")).toBe("not an ip");
  });

  it("handles IPv4 and IPv4-mapped IPv6 and zone ids", () => {
    expect(ipBucket("1.2.3.4", "a")).toBe("1.2.3.4");
    expect(ipBucket("::ffff:1.2.3.4", "a")).toBe("1.2.3.4");
    expect(ipBucket("fe80::1%eth0", "a")).toBe(ipBucket("fe80::2", "a"));
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

  it("accepts json and json with charset, rejects text/plain and missing content-type", () => {
    const url = "http://localhost/api/chat";
    expect(rejectsCrossSite(headers([["Content-Type", "application/json"]]), url)).toBe(false);
    expect(rejectsCrossSite(headers([["Content-Type", "application/json; charset=utf-8"]]), url)).toBe(false);
    expect(rejectsCrossSite(headers([["Content-Type", "Application/JSON; Charset=UTF-8"]]), url)).toBe(false);
    expect(rejectsCrossSite(headers([["Content-Type", "text/plain"]]), url)).toBe(true);
    expect(rejectsCrossSite(headers([]), url)).toBe(true);
  });

  it("rejects cross-site and same-site fetch metadata, accepts same-origin and none", () => {
    const url = "http://localhost/api/chat";
    const json: [string, string][] = [["Content-Type", "application/json"]];
    expect(rejectsCrossSite(headers([...json, ["Sec-Fetch-Site", "cross-site"]]), url)).toBe(true);
    expect(rejectsCrossSite(headers([...json, ["Sec-Fetch-Site", "same-site"]]), url)).toBe(true);
    expect(rejectsCrossSite(headers([...json, ["Sec-Fetch-Site", "same-origin"]]), url)).toBe(false);
    expect(rejectsCrossSite(headers([...json, ["Sec-Fetch-Site", "none"]]), url)).toBe(false);
  });

  it("rejects a mismatched or null Origin and accepts a matching host", () => {
    const url = "http://localhost/api/chat";
    const json: [string, string][] = [["Content-Type", "application/json"]];
    expect(rejectsCrossSite(headers([...json, ["Origin", "https://evil.example"]]), url)).toBe(true);
    expect(rejectsCrossSite(headers([...json, ["Origin", "null"]]), url)).toBe(true);
    expect(rejectsCrossSite(headers([...json, ["Origin", "http://localhost"]]), url)).toBe(false);
    expect(rejectsCrossSite(headers(json), url)).toBe(false);
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
