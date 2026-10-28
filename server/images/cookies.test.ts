import { describe, expect, it } from "vitest";
import { issueAnonId, parseAnonCookie, serializeAnonCookie, verifyAnonCookie } from "./cookies";

const SECRET = "test-secret-for-cookies";

describe("anon cookie", () => {
  it("accepts a valid signature", () => {
    const { id, value } = issueAnonId(SECRET);
    expect(verifyAnonCookie(value, SECRET)).toBe(id);
  });

  it("rejects a tampered value", () => {
    const { value } = issueAnonId(SECRET);
    expect(verifyAnonCookie(`${value}x`, SECRET)).toBeNull();
    expect(verifyAnonCookie(value, "wrong-secret")).toBeNull();
    expect(verifyAnonCookie(null, SECRET)).toBeNull();
    expect(verifyAnonCookie("no-dot-here", SECRET)).toBeNull();
  });

  it("round-trips through the cookie header", () => {
    const { value } = issueAnonId(SECRET);
    const header = `other=1; ${serializeAnonCookie(value)}`;
    expect(verifyAnonCookie(parseAnonCookie(header), SECRET)).not.toBeNull();
    expect(parseAnonCookie(null)).toBeNull();
  });

  it("sets httpOnly, Secure, and SameSite=Lax", () => {
    const out = serializeAnonCookie("v");
    expect(out).toContain("HttpOnly");
    expect(out).toContain("Secure");
    expect(out).toContain("SameSite=Lax");
  });
});
