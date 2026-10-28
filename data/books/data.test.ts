// Data test: every committed book under data/books must pass the
// pipeline invariants in scripts/validate-books.mjs.
import { describe, expect, it } from "vitest";
import { validateBooks } from "../../scripts/validate-books.mjs";
import ozBook from "./oz/book.json";

describe("processed book data", () => {
  it("has zero validation problems", () => {
    const { books, problems } = validateBooks();
    expect(books).toContain("oz");
    expect(problems).toEqual([]);
  });

  it("oz has 24 chapters", () => {
    expect(ozBook.chapters.length).toBe(24);
  });
});
