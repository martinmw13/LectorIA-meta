import { describe, expect, it } from "vitest";
import { isKnownBookId, isReadyBookId, loadBook, loadBookData, readyBookIds } from "./books";

function notFoundDigest(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return String((e as { digest?: unknown }).digest ?? (e as Error).message);
  }
  throw new Error("expected notFound() to throw");
}

describe("book registry", () => {
  it("loads the shelf book with its scenes", async () => {
    const { book, scenes } = await loadBook("oz");
    expect(book.id).toBe("oz");
    expect(book.title).toContain("Oz");
    expect(scenes.length).toBeGreaterThan(0);
    expect(readyBookIds()).toContain("oz");
    expect(isReadyBookId("oz")).toBe(true);
  });

  it("loads processed data for a known book off the shelf", async () => {
    expect(isKnownBookId("alice")).toBe(true);
    const { book, scenes } = await loadBookData("alice");
    expect(book.id).toBe("alice");
    expect(scenes.length).toBeGreaterThan(0);
  });

  it.each(["dracula", "pride", "sherlock"])("loads processed data for %s", async (id) => {
    expect(isKnownBookId(id)).toBe(true);
    expect(isReadyBookId(id)).toBe(true);
    const { book, scenes } = await loadBook(id);
    expect(book.id).toBe(id);
    expect(scenes.length).toBeGreaterThan(0);
  });

  it("404s on unknown ids", () => {
    expect(isKnownBookId("nope")).toBe(false);
    expect(isReadyBookId("nope")).toBe(false);
    expect(notFoundDigest(() => loadBook("nope"))).toContain("404");
    expect(notFoundDigest(() => loadBookData("nope"))).toContain("404");
  });

  it("404s on traversal-ish ids without resolving a path", () => {
    for (const id of ["../..", "..\\..", "oz/../alice", "oz/../../etc/passwd", "", "OZ", " oz ", "alice\0"]) {
      expect(isKnownBookId(id)).toBe(false);
      expect(notFoundDigest(() => loadBook(id))).toContain("404");
    }
  });
});
