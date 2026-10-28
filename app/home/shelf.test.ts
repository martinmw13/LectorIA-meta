import { describe, expect, it } from "vitest";
import { library, readingMinutes } from "@/core/library";
import { shelf, shelfById } from "./shelf";

describe("shelf", () => {
  it("holds the ten prototype books with Oz first and favorite", () => {
    expect(shelf.map((book) => book.id)).toEqual([
      "oz",
      "alice",
      "frankenstein",
      "pride",
      "sherlock",
      "dracula",
      "peterpan",
      "treasure",
      "jungle",
      "carol",
    ]);
    expect(shelf[0]?.favorite).toBe(true);
    expect(shelf.filter((book) => book.favorite)).toHaveLength(1);
  });

  it("marks ready exactly the books the library lists", () => {
    const readyIds = new Set(library.map((book) => book.id));
    for (const book of shelf) {
      expect(book.ready).toBe(readyIds.has(book.id));
    }
    expect(shelfById("oz")?.ready).toBe(true);
  });

  it("takes Oz's facts from the library manifest", () => {
    const oz = shelfById("oz");
    const live = library.find((book) => book.id === "oz");
    expect(oz).toBeDefined();
    expect(live).toBeDefined();
    expect(oz?.title).toBe(live?.title);
    expect(oz?.author).toBe(live?.author);
    expect(oz?.year).toBe(live?.year);
    expect(oz?.time).toBe(readingMinutes(live?.words ?? 0));
  });

  it("gives every book plate copy and a unique id", () => {
    const ids = new Set(shelf.map((book) => book.id));
    expect(ids.size).toBe(shelf.length);
    for (const book of shelf) {
      expect(book.label.length).toBeGreaterThan(0);
      expect(book.tag.length).toBeGreaterThan(0);
      expect(book.hook.length).toBeGreaterThan(0);
      expect(book.alt.length).toBeGreaterThan(0);
    }
  });
});
