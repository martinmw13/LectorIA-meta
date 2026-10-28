import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// No DOM test setup in this repo, so this pins the still-and-frameless
// contract against the sources directly.
const button = readFileSync(new URL("./rain-button.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./styles/ambience.css", import.meta.url), "utf8");

describe("rain button still and frameless", () => {
  it("has no idle animation loop", () => {
    expect(css).not.toMatch(/infinite/);
  });

  it("limits animation to hover and data-anim only", () => {
    expect(css).toMatch(/@media \(hover: hover\)/);
    expect(css).toMatch(/\[data-anim\] \.rain-drop/);
    expect(css).toMatch(/\[data-anim\] \.rain-bolt/);
  });

  it("keeps the button frameless with the glow on the icon", () => {
    expect(css).toMatch(/\.skip\.rain \{[^}]*border: none/);
    expect(css).toMatch(/\.skip\.rain \{[^}]*background: transparent/);
    expect(css).toMatch(/\.skip\.rain \{[^}]*box-shadow: none/);
    for (const level of ["drizzle", "moderate", "storm"]) {
      expect(css).toMatch(`[data-level="${level}"] svg`);
    }
    expect(css).toMatch(/drop-shadow\(0 0 3px var\(--rain-/);
    expect(css).toMatch(/:focus-visible/);
    expect(css).toMatch(/:focus:not\(:focus-visible\)/);
  });

  it("disables hover and click animations under reduced motion", () => {
    const reduced = css.slice(css.indexOf("prefers-reduced-motion"));
    expect(reduced).toMatch(/:hover/);
    expect(reduced).toMatch(/data-anim/);
    expect(reduced).toMatch(/animation: none/);
  });

  it("sets data-anim on click and clears it on a timeout with cleanup", () => {
    expect(button).toMatch(/data-anim=\{burst \? "1" : undefined\}/);
    expect(button).toMatch(/setTimeout\(\(\) => setBurst\(0\), ANIM_MS\)/);
    expect(button).toMatch(/clearTimeout\(burstTimer\.current\)/);
  });
});
