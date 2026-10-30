import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SKINS } from "../skin";
import { shelf } from "./shelf";
import { coverFor, type CoverSize } from "./covers";

const SIZES: CoverSize[] = ["sm", "lg"];

function onDisk(publicPath: string): boolean {
  return existsSync(join(__dirname, "..", "..", "public", publicPath));
}

describe("covers", () => {
  it("resolves every shelf book in every skin and size to a file under public/", () => {
    expect(shelf.length).toBeGreaterThan(0);
    for (const book of shelf) {
      for (const skin of SKINS) {
        for (const size of SIZES) {
          const path = coverFor(book.id, skin, size);
          expect(path.startsWith("/art/")).toBe(true);
          expect(onDisk(path), `${book.id} ${skin} ${size}: ${path}`).toBe(true);
        }
      }
    }
  });

  it("always shows Oz on the cyclone-house panel", () => {
    for (const skin of SKINS) {
      for (const size of SIZES) {
        expect(coverFor("oz", skin, size)).toBe("/art/panels/cyclone-house.webp");
      }
    }
  });

  it("maps the newer skins onto the three painted cover sets", () => {
    expect(coverFor("alice", "pencil", "lg")).toBe(coverFor("alice", "engraving", "lg"));
    expect(coverFor("alice", "comic", "lg")).toBe(coverFor("alice", "ink", "lg"));
    expect(coverFor("alice", "chihiro", "lg")).toBe(coverFor("alice", "watercolor", "lg"));
    expect(coverFor("alice", "pencil", "sm")).toContain("-engraving-sm.jpg");
  });
});
