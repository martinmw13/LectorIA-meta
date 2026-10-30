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

describe("shelfReadyIds", () => {
  it("lists ready ids favorites-first in manifest order", () => {
    expect(
      shelfReadyIds([
        { id: "b", status: "ready" },
        { id: "a", status: "ready", favorite: true },
        { id: "c", status: "ready" },
      ]),
    ).toEqual(["a", "b", "c"]);
  });

  it("skips non-ready and malformed entries", () => {
    expect(
      shelfReadyIds([
        { id: "soon", status: "soon" },
        { id: "ok", status: "ready" },
        null,
        "nope",
        { status: "ready" },
      ]),
    ).toEqual(["ok"]);
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
