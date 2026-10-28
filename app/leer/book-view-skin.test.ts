// Book view follows the live skin for the image style default.
// No DOM test setup in this repo, so the wiring is pinned against the
// source directly, plus a runtime check that the skin owner drives the pref.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { effectiveImageStylePref } from "../image-style";
import { getSkin, setSkin, subscribe } from "../skin";

const page = readFileSync(new URL("./book-view.tsx", import.meta.url), "utf8");

describe("book view image style skin", () => {
  it("derives the pref from the live skin, not the default", () => {
    expect(page).toMatch(/const skin = useSkin\(\);/);
    expect(page).toMatch(/effectiveImageStylePref\(storedPref, skin\)/);
    expect(page).toMatch(/from "\.\.\/use-skin"/);
    expect(page).not.toContain("DEFAULT_SKIN");
  });

  it("follows setSkin through the skin owner", () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const OLD_DOCUMENT = g.document;
    const OLD_STORAGE = g.localStorage;
    const saved: Record<string, string> = {};
    g.document = { documentElement: { dataset: { skin: "engraving" } } };
    g.localStorage = {
      getItem: (key: string) => saved[key] ?? null,
      setItem: (key: string, value: string) => {
        saved[key] = value;
      },
    };
    const unsub = subscribe(() => {});
    try {
      setSkin("ink");
      expect(effectiveImageStylePref(null, getSkin())).toEqual({
        kind: "preset",
        id: "pen-pencil",
      });
      setSkin("watercolor");
      expect(effectiveImageStylePref(null, getSkin())).toEqual({
        kind: "preset",
        id: "watercolor",
      });
    } finally {
      unsub();
      g.document = OLD_DOCUMENT;
      g.localStorage = OLD_STORAGE;
    }
  });
});
