import { describe, expect, it, vi } from "vitest";

// Alice on the shelf for this file only: the redirect is generic over
// ready books, and the real manifest lists Oz alone.
vi.mock("@/core/library", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/library")>();
  return {
    ...actual,
    library: [
      ...actual.library,
      {
        id: "alice",
        title: "Alice's Adventures in Wonderland",
        author: "Lewis Carroll",
        year: 1865,
        words: 26000,
        gutenbergId: 11,
        status: "ready",
        cover: "/art/covers/alice-engraving.jpg",
        coverAlt: "Alice follows the White Rabbit",
      },
    ],
  };
});

import { buildReaderModel } from "@/core/reader";
import { loadBookData } from "@/server/books";
import ReadBook from "./page";

async function thrownDigest(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    return String((e as { digest?: unknown }).digest ?? (e as Error).message);
  }
  throw new Error("expected a redirect or 404 throw");
}

describe("/read/[bookId]", () => {
  it("redirects a non-Oz book to its first scene", async () => {
    const { book, scenes } = await loadBookData("alice");
    const first = buildReaderModel(book, { scenes }).chapters[0]?.scenes[0]?.id;
    expect(first).toBeTruthy();
    const digest = await thrownDigest(() => ReadBook({ params: Promise.resolve({ bookId: "alice" }) }));
    expect(digest).toContain(`/read/alice/${first}`);
  });

  it("still redirects Oz", async () => {
    const digest = await thrownDigest(() => ReadBook({ params: Promise.resolve({ bookId: "oz" }) }));
    expect(digest).toContain("/read/oz/");
  });

  it("404s a known book missing from the shelf", async () => {
    const digest = await thrownDigest(() => ReadBook({ params: Promise.resolve({ bookId: "carol" }) }));
    expect(digest).toContain("404");
  });

  it("404s unknown and traversal-ish ids", async () => {
    for (const bookId of ["nope", "../..", "oz/../alice"]) {
      const digest = await thrownDigest(() => ReadBook({ params: Promise.resolve({ bookId }) }));
      expect(digest).toContain("404");
    }
  });
});
