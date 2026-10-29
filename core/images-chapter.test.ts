import { describe, expect, it } from "vitest";
import {
  ImageStyleError,
  buildCaption,
  imageKey,
  parseImageRequest,
  validateAgainstBook,
} from "./images";

const book = {
  id: "oz",
  textVersion: "t123",
  paragraphNs: new Set([1, 2, 3]),
  sceneIds: new Set(["c1s1"]),
  chapters: new Set([1, 2]),
};

const chapter = { kind: "chapter", bookId: "oz", textVersion: "t123", ch: 2 } as const;

describe("chapter parseImageRequest", () => {
  it("accepts a good chapter body with and without style", () => {
    expect(parseImageRequest({ ...chapter })).toEqual({ ...chapter });
    expect(parseImageRequest({ ...chapter, style: { preset: "pencil" } })).toEqual({
      ...chapter,
      style: { kind: "preset", id: "pencil" },
    });
  });

  it("rejects bad ch values", () => {
    for (const ch of [0, -1, 1.5, Number.NaN, "2", null]) {
      expect(() => parseImageRequest({ ...chapter, ch })).toThrow();
    }
  });

  it("rejects extra keys and missing fields", () => {
    expect(() => parseImageRequest({ ...chapter, extra: 1 })).toThrow();
    expect(() => parseImageRequest({ kind: "chapter", bookId: "oz" })).toThrow();
    expect(() =>
      parseImageRequest({ ...chapter, style: { preset: "nope" } }),
    ).toThrow(ImageStyleError);
  });
});

describe("chapter validateAgainstBook", () => {
  it("accepts a chapter of the book", () => {
    expect(() =>
      validateAgainstBook({ kind: "chapter", bookId: "oz", textVersion: "t123", ch: 1 }, book),
    ).not.toThrow();
  });

  it("rejects an unknown chapter, book, or version", () => {
    expect(() =>
      validateAgainstBook({ kind: "chapter", bookId: "oz", textVersion: "t123", ch: 99 }, book),
    ).toThrow();
    expect(() =>
      validateAgainstBook({ kind: "chapter", bookId: "dorothy", textVersion: "t123", ch: 1 }, book),
    ).toThrow();
    expect(() =>
      validateAgainstBook({ kind: "chapter", bookId: "oz", textVersion: "old", ch: 1 }, book),
    ).toThrow();
  });
});

describe("chapter imageKey", () => {
  it("keys the chapter page apart from scenes and passages", () => {
    expect(imageKey({ kind: "chapter", bookId: "oz", textVersion: "t123", ch: 2 })).toBe(
      "images/oz/t123/v1/chapter-2-c1.webp",
    );
  });

  it("inserts the style segment and treats denslow as omitted", () => {
    expect(
      imageKey({ kind: "chapter", bookId: "oz", textVersion: "t123", ch: 2, style: { kind: "preset", id: "pencil" } }),
    ).toBe("images/oz/t123/v1/style-pencil/chapter-2-c1.webp");
    expect(imageKey(parseImageRequest({ ...chapter, style: { preset: "denslow" } }))).toBe(
      "images/oz/t123/v1/chapter-2-c1.webp",
    );
  });

  it("leaves scene and passage keys byte-identical", () => {
    expect(imageKey({ kind: "passage", bookId: "oz", textVersion: "t123", n: 7 })).toBe(
      "images/oz/t123/v1/p7.webp",
    );
    expect(imageKey({ kind: "scene", bookId: "oz", textVersion: "t123", sceneId: "c1s1" })).toBe(
      "images/oz/t123/v1/scene-c1s1.webp",
    );
    expect(
      imageKey({ kind: "scene", bookId: "oz", textVersion: "t123", sceneId: "c1s1", style: { kind: "preset", id: "pencil" } }),
    ).toBe("images/oz/t123/v1/style-pencil/scene-c1s1.webp");
  });
});

describe("chapter buildCaption", () => {
  it("returns the chapter title", () => {
    expect(buildCaption({ kind: "chapter", sceneTitle: "The Cyclone", passageText: "" })).toBe(
      "The Cyclone",
    );
  });
});
