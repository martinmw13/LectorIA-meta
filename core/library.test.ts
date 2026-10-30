import { describe, expect, it } from "vitest";
import { library, loadLibrary, readingMinutes, shelfReadyIds } from "./library";

describe("library", () => {
  it("lists the ten ready books, Oz first as the favorite", () => {
    expect(library).toHaveLength(10);
    expect(library[0]).toMatchObject({ id: "oz", status: "ready", favorite: true });
    expect(library.every((entry) => entry.status === "ready")).toBe(true);
  });

  it("throws on a bad entry", () => {
    expect(() => loadLibrary([{ id: "x" }])).toThrow();
    expect(() => loadLibrary({})).toThrow();
    expect(() => loadLibrary([{ id: "x", title: "X", author: "Y", year: 1900, words: 1, gutenbergId: 1, status: "soon" }])).toThrow();
  });

  it("rejects a cover outside /art/", () => {
    const entry = {
      id: "x", title: "X", author: "Y", year: 1900, words: 1, gutenbergId: 1,
      status: "ready", cover: "https://example.com/x.jpg", coverAlt: "X",
    };
    expect(() => loadLibrary([entry])).toThrow();
  });

  it("formats reading time at 250 wpm", () => {
    expect(readingMinutes(11250)).toBe("About 45 min");
    expect(readingMinutes(40000)).toBe("About 2 h 40 min");
    expect(readingMinutes(39300)).toBe("About 2 h 37 min");
  });
});

const book = (id: string) => ({
  id,
  title: id.toUpperCase(),
  author: "Author",
  year: 1900,
  words: 1000,
  gutenbergId: 1,
  status: "ready",
  cover: `/art/covers/${id}.jpg`,
  coverAlt: `Cover of ${id}`,
});

describe("shelfReadyIds", () => {
  it("lists ready ids favorites-first in manifest order", () => {
    expect(
      shelfReadyIds([book("b"), { ...book("a"), favorite: true }, book("c")]),
    ).toEqual(["a", "b", "c"]);
  });

  it("rejects the same malformed entries loadLibrary rejects", () => {
    const bad = [
      [{ id: "soon", status: "soon" }],
      [null],
      ["nope"],
      [{ status: "ready" }],
      [{ id: "x", status: "ready" }],
    ];
    for (const raw of bad) {
      expect(() => shelfReadyIds(raw)).toThrow();
      expect(() => loadLibrary(raw)).toThrow();
    }
  });

  it("throws on a non-array manifest", () => {
    expect(() => shelfReadyIds({})).toThrow();
  });

  it("matches the real manifest: ten books, Oz first", () => {
    const ids = shelfReadyIds();
    expect(ids).toHaveLength(10);
    expect(ids[0]).toBe("oz");
  });
});
