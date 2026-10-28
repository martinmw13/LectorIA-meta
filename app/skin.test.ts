import { describe, expect, it } from "vitest";
import { DEFAULT_SKIN, isSkinId, SKINS } from "./skin";

describe("skin", () => {
  it("ships only the default skin", () => {
    expect(SKINS).toEqual(["default"]);
    expect(DEFAULT_SKIN).toBe("default");
  });

  it("accepts only known skin ids", () => {
    expect(isSkinId("default")).toBe(true);
    expect(isSkinId("watercolor")).toBe(false);
    expect(isSkinId(undefined)).toBe(false);
    expect(isSkinId(null)).toBe(false);
  });
});
