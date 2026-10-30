import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createMetaClient, isPolicyRejection, MetaImageError, safeFailureReason, scrubDetail } from "./meta";

describe("meta image failure reasons", () => {
  it("reports status and provider code without the raw body or secrets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: { code: "content_policy_violation", type: "invalid_request_error", message: "filtered", secret: "x" },
          }),
          { status: 400 },
        ),
      ),
    );
    const err = await createMetaClient("test-key").generate("p").catch((e: unknown) => e);
    expect(isPolicyRejection(err)).toBe(true);
    const reason = safeFailureReason(err);
    expect(reason).toContain("meta status 400 code=content_policy_violation");
    expect(reason).not.toContain("test-key");
    expect(reason).not.toContain("secret");
    vi.unstubAllGlobals();
  });

  it("redacts key-like tokens and maps unknown errors to their name", () => {
    expect(scrubDetail("bad Bearer abc123 and sk-live-999")).toBe("bad [redacted] and [redacted]");
    expect(safeFailureReason(new TypeError("leaky detail"))).toBe("TypeError");
  });

  it.each([
    "code=content_policy_violation",
    "code=CONTENT_POLICY_VIOLATION",
    "type=policy_error",
    "code=safety_block",
    "type=content_filter",
    '"Request Blocked by moderation"',
  ])("treats %s as a policy rejection", (detail) => {
    expect(isPolicyRejection(new MetaImageError(400, detail))).toBe(true);
  });

  it("does not treat other failures as policy rejections", () => {
    expect(isPolicyRejection(new MetaImageError(500, "code=server_error"))).toBe(false);
    expect(isPolicyRejection(new MetaImageError(429, "code=rate_limited"))).toBe(false);
    expect(isPolicyRejection(new Error("content_policy"))).toBe(false);
  });
});
