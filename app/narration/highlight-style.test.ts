import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { highlightStyleFor } from "./highlight-style";

describe("highlightStyleFor", () => {
  it("maps all six skins to their treatment", () => {
    expect(highlightStyleFor("engraving")).toBe("engraving");
    expect(highlightStyleFor("pencil")).toBe("pencil");
    expect(highlightStyleFor("watercolor")).toBe("watercolor");
    expect(highlightStyleFor("chihiro")).toBe("lantern");
    expect(highlightStyleFor("ink")).toBe("ink-doodle");
    expect(highlightStyleFor("comic")).toBe("ink-doodle");
  });

  it("falls back to engraving for today and unknown skins", () => {
    expect(highlightStyleFor("default")).toBe("engraving");
    expect(highlightStyleFor("ink-doodle")).toBe("engraving");
    expect(highlightStyleFor("")).toBe("engraving");
    expect(highlightStyleFor("noir")).toBe("engraving");
  });

  it("keeps body text positioned so read-aloud marks paint behind it", () => {
    const css = readFileSync("app/styles/folio.css", "utf8");
    expect(css).toMatch(/\.body-text\s*\{[^}]*position:\s*relative/);
  });
});
