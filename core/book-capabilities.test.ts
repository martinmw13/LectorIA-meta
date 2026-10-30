import { describe, expect, it } from "vitest";
import {
  hasDenslowLook,
  hasLegacyRoutes,
  hasNarration,
  hasPanels,
  LEGACY_ROUTE_BOOK_ID,
} from "./book-capabilities";

describe("book capabilities", () => {
  it("keeps the legacy /leer addresses on Oz only", () => {
    expect(hasLegacyRoutes("oz")).toBe(true);
    expect(hasLegacyRoutes("alice")).toBe(false);
    expect(LEGACY_ROUTE_BOOK_ID).toBe("oz");
  });

  it("has pregenerated chapter pages for Oz only", () => {
    expect(hasPanels("oz")).toBe(true);
    expect(hasPanels("alice")).toBe(false);
  });

  it("defaults to the Denslow look for Oz and unknown books", () => {
    expect(hasDenslowLook(undefined)).toBe(true);
    expect(hasDenslowLook("oz")).toBe(true);
    expect(hasDenslowLook("alice")).toBe(false);
  });

  it("reads narration from the loaded manifest, not the book id", () => {
    expect(hasNarration([])).toBe(false);
    expect(hasNarration([{ ch: 1 }])).toBe(true);
  });
});
