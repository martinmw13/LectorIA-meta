// @vitest-environment jsdom
// "Your books" storage: newest first, capped at 20, bad entries dropped.
import { beforeEach, describe, expect, test } from "vitest";
import { loadMyBooks, MY_BOOKS_MAX, removeMyBook, saveMyBook } from "./my-books";

const KEY = "lectoria.myBooks.v1";
const id = (n: number): string => `u-${String(n).padStart(22, "A")}`;

beforeEach(() => {
  window.localStorage.clear();
});

describe("my-books", () => {
  test("saves newest first and moves re-saves to the front", () => {
    saveMyBook({ id: id(1), title: "One", author: "A", savedAt: 1 });
    saveMyBook({ id: id(2), title: "Two", author: "B", savedAt: 2 });
    expect(loadMyBooks().map((b) => b.id)).toEqual([id(2), id(1)]);
    saveMyBook({ id: id(1), title: "One", author: "A", savedAt: 3 });
    expect(loadMyBooks().map((b) => b.id)).toEqual([id(1), id(2)]);
  });

  test("caps the list at 20 entries", () => {
    expect(MY_BOOKS_MAX).toBe(20);
    for (let n = 1; n <= 25; n++) {
      saveMyBook({ id: id(n), title: `Book ${n}`, author: "A", savedAt: n });
    }
    const books = loadMyBooks();
    expect(books).toHaveLength(20);
    expect(books[0]?.title).toBe("Book 25");
    expect(books[19]?.title).toBe("Book 6");
  });

  test("remove forgets one id locally", () => {
    saveMyBook({ id: id(1), title: "One", author: "A", savedAt: 1 });
    saveMyBook({ id: id(2), title: "Two", author: "B", savedAt: 2 });
    expect(removeMyBook(id(2)).map((b) => b.id)).toEqual([id(1)]);
    expect(loadMyBooks().map((b) => b.id)).toEqual([id(1)]);
  });

  test("bad JSON reads as empty and never throws", () => {
    window.localStorage.setItem(KEY, "{oops");
    expect(loadMyBooks()).toEqual([]);
    window.localStorage.setItem(KEY, '"nope"');
    expect(loadMyBooks()).toEqual([]);
  });

  test("wrong-shaped entries are filtered out", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify([
        { id: id(1), title: "Good", author: "A", savedAt: 1 },
        { id: "oz", title: "Shelf", author: "A", savedAt: 2 },
        { id: id(2), title: "No author", savedAt: 3 },
        { id: id(3), title: "", author: "A", savedAt: 4 },
        { id: id(4), title: "Bad date", author: "A", savedAt: "now" },
        null,
        "x",
      ]),
    );
    expect(loadMyBooks().map((b) => b.id)).toEqual([id(1)]);
  });

  test("stored entries hold no text and no key", () => {
    saveMyBook({ id: id(1), title: "One", author: "A", savedAt: 1 });
    expect(Object.keys(JSON.parse(window.localStorage.getItem(KEY) ?? "[]")[0]).sort()).toEqual([
      "author",
      "id",
      "savedAt",
      "title",
    ]);
  });
});
