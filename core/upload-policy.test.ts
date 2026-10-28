import { describe, expect, it } from "vitest";
import { approxPages, FREE_BOOK_MAX_WORDS, uploadRoute, WORDS_PER_PAGE } from "./upload-policy";

describe("upload-policy", () => {
  it("derives about 200 free pages from the constants", () => {
    expect(WORDS_PER_PAGE).toBe(250);
    expect(approxPages(FREE_BOOK_MAX_WORDS)).toBe(200);
  });

  it("routes short unused books to the free path", () => {
    expect(uploadRoute(1000, false)).toEqual({ kind: "free" });
    expect(uploadRoute(FREE_BOOK_MAX_WORDS, false)).toEqual({ kind: "free" });
  });

  it("routes used-up or long books to BYOK, long first", () => {
    expect(uploadRoute(1000, true)).toEqual({ kind: "byok", reason: "free_used" });
    expect(uploadRoute(FREE_BOOK_MAX_WORDS + 1, false)).toEqual({ kind: "byok", reason: "too_long" });
    expect(uploadRoute(FREE_BOOK_MAX_WORDS + 1, true)).toEqual({ kind: "byok", reason: "too_long" });
  });
});
