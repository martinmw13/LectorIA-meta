import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// No DOM test setup in this repo, so this pins the still-and-frameless
// contract against the sources directly.
const control = readFileSync(new URL("./music-style-control.tsx", import.meta.url), "utf8");
const base = readFileSync(new URL("../styles/music-style-control.css", import.meta.url), "utf8");
const classic = readFileSync(new URL("../styles/motion-classic.css", import.meta.url), "utf8");
const pencil = readFileSync(new URL("../styles/motion-pencil.css", import.meta.url), "utf8");
const comic = readFileSync(new URL("../styles/motion-comic.css", import.meta.url), "utf8");
const icons = readFileSync(new URL("../styles/motion-icons.css", import.meta.url), "utf8");
const css = [base, classic, pencil, comic, icons].join("\n");

/** Strip every `@media (hover: hover) { ... }` and reduced-motion block,
 * balancing braces. Hover rules are allowed in both: the point is that no
 * hover rule runs unconditionally at rest. */
function stripGatedBlocks(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const hover = src.indexOf("@media (hover: hover)", i);
    const reduced = src.indexOf("@media (prefers-reduced-motion: reduce)", i);
    let at = -1;
    if (hover >= 0 && reduced >= 0) at = Math.min(hover, reduced);
    else at = Math.max(hover, reduced);
    if (at < 0) {
      out += src.slice(i);
      break;
    }
    out += src.slice(i, at);
    let depth = 1;
    let j = src.indexOf("{", at) + 1;
    while (j < src.length && depth > 0) {
      if (src[j] === "{") depth += 1;
      else if (src[j] === "}") depth -= 1;
      j += 1;
    }
    i = j;
  }
  return out;
}

describe("music style control still and frameless", () => {
  it("has no idle animation loop", () => {
    expect(css).not.toMatch(/infinite/);
  });

  it("keeps hover rules inside hover-capable media only", () => {
    const prose = stripGatedBlocks(css).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(prose).not.toMatch(/:hover/);
  });

  it("has one-shot data-anim rules with the prototype face-in keyframes", () => {
    expect(css).toMatch(/\[data-anim[^\]]*\][^{]*\{[^}]*animation:/);
    for (const name of ["coin-in", "wet-in", "pop-in", "pencil-settle", "comic-pow"]) {
      expect(css).toMatch(new RegExp(`@keyframes ${name}`));
    }
    expect(css).not.toMatch(/@keyframes sticker-pop/);
  });

  it("renders the shared fx overlay instead of inline notes", () => {
    expect(control).toMatch(/<ButtonFx kind="music" key=\{burst\} \/>/);
    expect(control).toMatch(/<ClassicMusicFx mode=/);
    expect(control).not.toContain("mode-notes");
    expect(css).not.toContain(".mode-notes");
  });

  it("keeps the Chopin button frameless", () => {
    const chopinBlocks = [...base.matchAll(/\.chopin[^{]*\{([^}]*)}/g)].map((m) => m[1] as string);
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
    expect(base).toMatch(/\.chopin\[aria-pressed="true"\] \+ \.sticker-dot/);
  });

  it("shows no outline for the pressed state", () => {
    const pressed = [...base.matchAll(/aria-pressed[^{]*\{([^}]*)}/g)].map((m) => m[1] as string);
    expect(pressed.length).toBeGreaterThan(0);
    for (const block of pressed ?? []) {
      expect(block).not.toMatch(/outline/);
    }
  });

  it("shows the focus ring on keyboard focus only", () => {
    expect(base).toMatch(/\.sticker:focus-visible/);
    expect(base).toMatch(/\.chopin:focus-visible/);
    expect(base).toMatch(/:focus:not\(:focus-visible\)/);
  });

  it("disables hover and change animations under reduced motion", () => {
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
