import { describe, expect, it } from "vitest";
import { highlightStyleFor } from "./highlight-style";

describe("highlightStyleFor", () => {
  it("maps each decided skin to its treatment", () => {
    expect(highlightStyleFor("engraving")).toBe("engraving");
    expect(highlightStyleFor("watercolor")).toBe("watercolor");
    expect(highlightStyleFor("ink-doodle")).toBe("ink-doodle");
  });

  it("falls back to engraving for today and unknown skins", () => {
    expect(highlightStyleFor("default")).toBe("engraving");
    expect(highlightStyleFor("")).toBe("engraving");
    expect(highlightStyleFor("noir")).toBe("engraving");
  });
});
