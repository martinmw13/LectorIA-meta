import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/uploads/loader", () => ({ loadUploadedBook: vi.fn() }));

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
import { loadUploadedBook } from "@/server/uploads/loader";
import ReadBook from "./page";

const mockedLoader = vi.mocked(loadUploadedBook);
const UPLOAD_ID = "u-AAAAAAAAAAAAAAAAAAAAAA";

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

  it("redirects a shelf book to its first scene", async () => {
    const digest = await thrownDigest(() => ReadBook({ params: Promise.resolve({ bookId: "carol" }) }));
    expect(digest).toContain("/read/carol/c1s");
  });

  it("404s unknown and traversal-ish ids", async () => {
    for (const bookId of ["nope", "../..", "oz/../alice"]) {
      const digest = await thrownDigest(() => ReadBook({ params: Promise.resolve({ bookId }) }));
      expect(digest).toContain("404");
    }
  });
});

describe("/read/[bookId] uploads", () => {
  const payload = {
    book: {
      id: UPLOAD_ID,
      title: "Middlemarch",
      author: "George Eliot",
      chapters: [{ ch: 1, title: "One", start_n: 1, end_n: 1 }],
      paragraphs: [{ id: "c1p1", n: 1, ch: 1, text: "Hello." }],
      textVersion: "v",
    },
    scenes: [
      {
        id: "c1s1",
        ch: 1,
        start_n: 1,
        end_n: 1,
        title: "S1",
        summary: "",
        characters: [],
        jev: null,
        muse_override: null,
        final: null,
        error: null,
      },
    ],
  };

  beforeEach(() => {
    mockedLoader.mockReset();
  });

  it("redirects a finished upload to its first scene", async () => {
    mockedLoader.mockResolvedValue(payload as never);
    const digest = await thrownDigest(() => ReadBook({ params: Promise.resolve({ bookId: UPLOAD_ID }) }));
    expect(digest).toContain(`/read/${UPLOAD_ID}/c1s1`);
  });

  it("404s an upload whose job is missing or expired", async () => {
    mockedLoader.mockResolvedValue(null);
    const digest = await thrownDigest(() => ReadBook({ params: Promise.resolve({ bookId: UPLOAD_ID }) }));
    expect(digest).toContain("404");
  });
});
