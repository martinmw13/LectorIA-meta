import { describe, expect, it } from "vitest";
import { clientIp, hashIp, utcDay } from "./request";

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

  it("takes the first forwarded entry and buckets the missing one", () => {
    expect(clientIp("1.2.3.4, 5.6.7.8")).toBe("1.2.3.4");
    expect(clientIp("  1.2.3.4  ")).toBe("1.2.3.4");
    expect(clientIp(null)).toBe("unknown");
    expect(clientIp("")).toBe("unknown");
  });
});
