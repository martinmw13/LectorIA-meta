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

  it("plays hover animations only under hover media", () => {
    expect(css).toMatch(/@media \(hover: hover\)/);
    const withoutHoverBlock = css.replace(/@media \(hover: hover\) \{[\s\S]*?\n\}\n/, "");
    expect(withoutHoverBlock).not.toMatch(/\.skip\.rain:hover/);
  });

  it("keys state-change animations on data-anim, never on mount", () => {
    for (const cls of ["face", "drop", "bolt", "etch", "draw", "bloom", "wet"]) {
      expect(css).toMatch(new RegExp(`\\[data-anim\\][\\s\\S]*?\\.${cls}[\\s,{]`));
    }
    expect(css).not.toMatch(/\.skip\.rain \.face\s*\{[^}]*animation:/);
  });

  it("keeps the button boxless with the art sized inside the hit area", () => {
    expect(css).toMatch(/\.skip\.rain \{[^}]*border: none/);
    expect(css).toMatch(/\.skip\.rain \{[^}]*background: transparent/);
    expect(css).toMatch(/\.skip\.rain \{[^}]*box-shadow: none/);
    expect(css).toMatch(/\.skip\.rain svg \{[^}]*width: 30px/);
    expect(css).toMatch(/\.skip\.rain svg \{[^}]*overflow: visible/);
    expect(css).toMatch(/svg \[fill\]:not\(\[stroke\]\) \{\s*stroke: none;\s*\}/);
    expect(css).toMatch(
      /\.player \.skip\.rain:focus-visible \{\s*outline: 2px solid var\(--color-accent\);\s*outline-offset: 2px;\s*border-radius: 6px;\s*\}/,
    );
    expect(css).toMatch(/\.player \.skip\.rain:focus:not\(:focus-visible\) \{\s*outline: none;\s*\}/);
  });

  it("disables rain animations under reduced motion, allowing only a short fade", () => {
    const reduced = css.slice(css.indexOf("prefers-reduced-motion"));
    expect(reduced).toMatch(/animation: none/);
    expect(reduced).toMatch(/transition: none/);
    expect(reduced).toMatch(/\[data-anim\] \.face/);
    expect(reduced).toMatch(/200ms/);
    expect(reduced).not.toMatch(/infinite/);
  });

  it("renders the registry icon for the level with no inline svg", () => {
    expect(button).toMatch(/<Icon name=\{`rain-\$\{level\}`/);
    expect(button).toMatch(/<span className="face" key=\{burst\}>/);
    expect(button).not.toContain("<svg");
  });

  it("reads the skin from data-skin with the default for hydration", () => {
    expect(button).toMatch(/useState<SkinId>\(DEFAULT_SKIN\)/);
    expect(button).toMatch(/document\.documentElement\.dataset\.skin/);
    expect(button).toMatch(/isSkinId\(current\)/);
  });

  it("sets data-anim on click and clears it on a timeout with cleanup", () => {
    expect(button).toMatch(/data-anim=\{burst \? "1" : undefined\}/);
    expect(button).toMatch(/setTimeout\(\(\) => setBurst\(0\), ANIM_MS\)/);
    expect(button).toMatch(/clearTimeout\(burstTimer\.current\)/);
  });
});
