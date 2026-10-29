import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// No DOM test setup in this repo, so this pins the still-and-frameless
// contract against the sources directly.
const button = readFileSync(new URL("./rain-button.tsx", import.meta.url), "utf8");
const ambience = readFileSync(new URL("./styles/ambience.css", import.meta.url), "utf8");
const classic = readFileSync(new URL("./styles/motion-classic.css", import.meta.url), "utf8");
const pencil = readFileSync(new URL("./styles/motion-pencil.css", import.meta.url), "utf8");
const comic = readFileSync(new URL("./styles/motion-comic.css", import.meta.url), "utf8");
const css = [ambience, classic, pencil, comic].join("\n");

/** Strip gated `@media (hover: hover) { ... }` and reduced-motion blocks,
 * balancing braces, so the rest-state assertions see only ungated rules. */
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

describe("rain button still and frameless", () => {
  it("has no idle animation loop", () => {
    expect(css).not.toMatch(/infinite/);
  });

  it("plays hover animations only under hover media", () => {
    for (const file of [ambience, classic, pencil, comic]) {
      if (/:hover/.test(file)) expect(file).toMatch(/@media \(hover: hover\)/);
    }
    expect(stripGatedBlocks(css)).not.toMatch(/\.skip\.rain[^{]*:hover/);
  });

  it("keys state-change animations on data-anim, never on mount", () => {
    for (const cls of ["face", "drop", "bolt", "etch", "draw", "bloom", "wet"]) {
      expect(css).toMatch(new RegExp(`\\[data-anim\\][\\s\\S]*?\\.${cls}\\b`));
    }
    expect(ambience).not.toMatch(/\.skip\.rain \.face\s*\{[^}]*animation:/);
  });

  it("keeps the button boxless with the art sized inside the hit area", () => {
    expect(ambience).toMatch(/\.skip\.rain \{[^}]*border: none/);
    expect(ambience).toMatch(/\.skip\.rain \{[^}]*background: transparent/);
    expect(ambience).toMatch(/\.skip\.rain \{[^}]*box-shadow: none/);
    expect(ambience).toMatch(/\.skip\.rain svg \{[^}]*width: 30px/);
    expect(ambience).toMatch(/\.skip\.rain svg \{[^}]*overflow: visible/);
    expect(ambience).toMatch(/svg \[fill\]:not\(\[stroke\]\) \{\s*stroke: none;\s*\}/);
    expect(ambience).toMatch(
      /\.player \.skip\.rain:focus-visible \{\s*outline: 2px solid var\(--color-accent\);\s*outline-offset: 2px;\s*border-radius: 6px;\s*\}/,
    );
    expect(ambience).toMatch(/\.player \.skip\.rain:focus:not\(:focus-visible\) \{\s*outline: none;\s*\}/);
  });

  it("disables rain animations under reduced motion, allowing only a short fade", () => {
    const reduced = css.slice(css.indexOf("prefers-reduced-motion"));
    expect(reduced).toMatch(/animation: none/);
    expect(reduced).toMatch(/200ms/);
    expect(reduced).toMatch(/display: none/);
    expect(reduced).not.toMatch(/infinite/);
  });

  it("renders the registry icon for the level with no inline svg", () => {
    expect(button).toMatch(/<Icon name=\{`rain-\$\{level\}`/);
    expect(button).toMatch(/<span className="face" key=\{burst\}>/);
    expect(button).not.toContain("<svg");
  });

  it("renders the shared fx overlay for pencil and chihiro particles", () => {
    expect(button).toMatch(/<ButtonFx kind="rain" level=\{fxLevel\} \/>/);
    expect(button).toMatch(/const fxLevel/);
  });

  it("reads the skin from the skin owner with the default for hydration", () => {
    expect(button).toMatch(/const skin = useSkin\(\);/);
    expect(button).toMatch(/const artSkin = iconSkin\(`rain-\$\{level\}` as RainIconName, skin\);/);
    expect(button).not.toContain("hasRainArt");
    expect(button).not.toMatch(/document\.documentElement\.dataset\.skin/);
  });

  it("renders the resolved art skin and keys the rain CSS on it", () => {
    expect(button).toMatch(/data-art=\{artSkin\}/);
    expect(button).toMatch(/skin=\{artSkin\}/);
    for (const art of ["engraving", "watercolor", "ink", "pencil", "comic", "chihiro"]) {
      expect(ambience).toMatch(new RegExp(`\\.skip\\.rain\\[data-art="${art}"\\]`));
    }
    expect(ambience).toMatch(/html\[data-theme="dark"\] \.player \.skip\.rain\[data-art=/);
  });

  it("scopes per-skin rain motion under the skin with prototype values", () => {
    for (const art of ["engraving", "watercolor", "ink"]) {
      expect(classic).toMatch(new RegExp(`html\\[data-skin="${art}"\\][\\s\\S]*?\\.skip\\.rain`));
    }
    expect(pencil).toMatch(/\.skip\.rain/);
    expect(comic).toMatch(/\.skip\.rain/);
  });

  it("sets data-anim on click and clears it on a timeout with cleanup", () => {
    expect(button).toMatch(/data-anim=\{burst \? "1" : undefined\}/);
    expect(button).toMatch(/setTimeout\(\(\) => setBurst\(0\), ANIM_MS\)/);
    expect(button).toMatch(/clearTimeout\(burstTimer\.current\)/);
  });
});
