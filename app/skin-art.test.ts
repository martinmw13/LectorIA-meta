import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SKINS } from "./skin";
import { heroArt } from "./skin-art";

describe("heroArt", () => {
  it("gives the default engraving skin its own music and read-aloud art", () => {
    expect(heroArt("engraving")).not.toBeNull();
  });

  it("points every skin's art at a real, well-formed SVG in public/", () => {
    for (const skin of SKINS) {
      const art = heroArt(skin);
      if (!art) continue;
      for (const src of Object.values(art)) {
        const file = join(process.cwd(), "public", src);
        expect(existsSync(file), src).toBe(true);
        const svg = readFileSync(file, "utf8");
        expect(svg.trimStart().startsWith("<svg"), src).toBe(true);
        expect(svg).not.toMatch(/<script|on\w+=/i);
      }
    }
  });
});
