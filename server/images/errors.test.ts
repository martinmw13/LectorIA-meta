import { describe, expect, it } from "vitest";
import { errorTag } from "./errors";

describe("errorTag", () => {
  it("passes through own kv status messages", () => {
    expect(errorTag(new Error("kv status 401"))).toBe("kv status 401");
  });

  it("returns name plus cause code without leaking the URL", () => {
    const tag = errorTag(
      new TypeError('fetch failed for "https://secret.example"', {
        cause: { code: "ERR_INVALID_URL" },
      }),
    );
    expect(tag).toBe("TypeError:ERR_INVALID_URL");
    expect(tag).not.toContain("secret.example");
  });

  it("returns unknown for non-Errors", () => {
    expect(errorTag("boom")).toBe("unknown");
  });
});
