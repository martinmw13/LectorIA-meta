import { describe, expect, it } from "vitest";
import { buildReaderModel } from "@/core/reader";
import { loadBook, readyBookIds } from "@/server/books";
import { generateStaticParams } from "./page";

describe("/read/[bookId]/[sceneId]", () => {
  it("prerenders at most the first scene per ready book", async () => {
    const params = await generateStaticParams();
    expect(params).toHaveLength(readyBookIds().length);
    for (const { bookId, sceneId } of params) {
      const { book, scenes } = await loadBook(bookId);
      const first = buildReaderModel(book, { scenes }).chapters[0]?.scenes[0]?.id;
      expect(sceneId).toBe(first);
    }
  });
});
