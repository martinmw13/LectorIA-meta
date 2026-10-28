import { describe, expect, it } from "vitest";
import { DEFAULT_SKIN, isSkinId, SKINS, SKIN_SCRIPT } from "./skin";

describe("skin", () => {
  it("ships the three rain-button skins with engraving first", () => {
    expect(SKINS).toEqual(["engraving", "watercolor", "ink"]);
    expect(DEFAULT_SKIN).toBe("engraving");
  });

  it("accepts only known skin ids", () => {
    expect(isSkinId("engraving")).toBe(true);
    expect(isSkinId("watercolor")).toBe(true);
    expect(isSkinId("ink")).toBe(true);
    expect(isSkinId("default")).toBe(false);
    expect(isSkinId(undefined)).toBe(false);
    expect(isSkinId(null)).toBe(false);
  });

  it("inline script applies a valid ?skin= value and ignores the rest", () => {
    const run = (search: string): string | undefined => {
      let skin: string | undefined;
      new Function("location", "document", SKIN_SCRIPT)(
        { search },
        {
          documentElement: {
            dataset: {
              set skin(v: string) {
                skin = v;
              },
            },
          },
        },
      );
      return skin;
    };
    expect(run("?skin=watercolor")).toBe("watercolor");
    expect(run("?skin=ink")).toBe("ink");
    expect(run("?skin=engraving")).toBe("engraving");
    expect(run("?skin=default")).toBe(undefined);
    expect(run("?skin=")).toBe(undefined);
    expect(run("")).toBe(undefined);
    expect(run("?other=1")).toBe(undefined);
  });

  it("inline script never throws and stays in sync with SKINS", () => {
    expect(SKIN_SCRIPT).toContain("try");
    expect(SKIN_SCRIPT).toContain(JSON.stringify(SKINS));
  });
});
