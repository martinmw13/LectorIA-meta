import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// No DOM test setup in this repo, so this pins the still-and-frameless
// contract against the sources directly.
const control = readFileSync(new URL("./music-style-control.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles/music-style-control.css", import.meta.url), "utf8");

describe("music style control still and frameless", () => {
  it("has no idle animation loop", () => {
    expect(css).not.toMatch(/infinite/);
  });

  it("keeps hover rules inside hover-capable media only", () => {
    expect(css).toMatch(/@media \(hover: hover\)/);
    const before = css.slice(0, css.indexOf("@media (hover: hover)"));
    expect(before).not.toMatch(/:hover/);
  });

  it("has one-shot data-anim rules and no idle data-anim resting state", () => {
    expect(css).toMatch(/\[data-anim[^\]]*\][^{]*\{[^}]*animation:/);
    expect(css).toMatch(/@keyframes sticker-pop/);
  });

  it("keeps the Chopin button frameless", () => {
    const chopinBlocks = [...css.matchAll(/\.chopin[^{]*\{([^}]*)\}/g)].map((m) => m[1] as string);
    expect(chopinBlocks.length).toBeGreaterThan(0);
    for (const block of chopinBlocks ?? []) {
      expect(block).not.toMatch(/border-color/);
      for (const decl of block.match(/box-shadow\s*:[^;]+/g) ?? []) {
        expect(decl).toMatch(/box-shadow\s*:\s*none\b/);
      }
      for (const decl of block.match(/border\s*:[^;]+/g) ?? []) {
        expect(decl).toMatch(/border\s*:\s*(0|none)\b/);
      }
    }
    expect(css).toMatch(/\.chopin\[aria-pressed="true"\] \+ \.sticker-dot/);
  });

  it("shows no outline for the pressed state", () => {
    const pressed = [...css.matchAll(/aria-pressed[^{]*\{([^}]*)\}/g)].map((m) => m[1] as string);
    expect(pressed.length).toBeGreaterThan(0);
    for (const block of pressed ?? []) {
      expect(block).not.toMatch(/outline/);
    }
  });

  it("shows the focus ring on keyboard focus only", () => {
    expect(css).toMatch(/\.sticker:focus-visible/);
    expect(css).toMatch(/\.chopin:focus-visible/);
    expect(css).toMatch(/:focus:not\(:focus-visible\)/);
  });

  it("disables hover and pop animations under reduced motion", () => {
    const reduced = css.slice(css.indexOf("prefers-reduced-motion"));
    expect(reduced).toMatch(/:hover/);
    expect(reduced).toMatch(/data-anim/);
    expect(reduced).toMatch(/animation: none/);
  });

  it("pops the newly current button once from a current-driven effect", () => {
    expect(control).toMatch(/data-anim=\{anim === s\.id \? "1" : undefined\}/);
    expect(control).toMatch(/data-anim=\{anim === playlist\.id \? "1" : undefined\}/);
    expect(control).toMatch(/useEffect/);
    expect(control).toMatch(/firstRef\.current/);
    expect(control).toMatch(/setTimeout\(\(\) => setAnim\(null\), ANIM_MS\)/);
    expect(control).toMatch(/clearTimeout\(animTimer\.current\)/);
  });
});
