import { describe, expect, it } from "vitest";
import { SKINS } from "../skin";
import { shelf } from "./shelf";
import { coverFor } from "./covers";

describe("covers", () => {
  it("returns null while a cover is missing", () => {
    expect(coverFor("oz", "comic", {})).toBeNull();
    expect(coverFor("alice", "engraving", {})).toBeNull();
  });

  it("returns null for unknown books and skins", () => {
    expect(coverFor("moby", "comic", {})).toBeNull();
    expect(coverFor("oz", "comic", { comic: { oz: "/covers/v1/comic/oz.webp" } })).toBe(
      "/covers/v1/comic/oz.webp",
    );
  });

  it("reads every shelf cover from the manifest", () => {
    const manifest: Record<string, Record<string, string>> = {};
    for (const book of shelf) {
      for (const skin of SKINS) {
        ((manifest[skin] ??= {})[book.id] = `/covers/v1/${skin}/${book.id}.webp`);
      }
    }
    for (const book of shelf) {
      for (const skin of SKINS) {
        expect(coverFor(book.id, skin, manifest)).toBe(`/covers/v1/${skin}/${book.id}.webp`);
      }
    }
  });

  it("keeps the committed manifest under public/covers/v1", async () => {
    const { COVER_MANIFEST } = await import("./cover-manifest");
    for (const [skin, books] of Object.entries(COVER_MANIFEST)) {
      expect(skin.length).toBeGreaterThan(0);
      for (const [book, path] of Object.entries(books ?? {})) {
        expect(path, `${skin}/${book}`).toBe(`/covers/v1/${skin}/${book}.webp`);
      }
    }
  });
});
