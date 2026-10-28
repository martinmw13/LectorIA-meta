import { describe, expect, it } from "vitest";
import { library, loadLibrary, readingMinutes } from "./library";

describe("library", () => {
  it("lists only the ready Oz entry, favorite first", () => {
    expect(library).toHaveLength(1);
    expect(library[0]).toMatchObject({ id: "oz", status: "ready", favorite: true });
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
