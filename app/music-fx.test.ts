import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Pins the approved-prototype classic-skin music motion against the React
// port (app/folio/classic-music-fx.tsx), its stylesheet
// (app/styles/motion-music-classic.css) and the wiring in
// app/folio/music-style-control.tsx. Every assertion reads the sources
// directly, like app/button-motion.test.ts.
const css = readFileSync(new URL("./styles/motion-music-classic.css", import.meta.url), "utf8");
const fx = readFileSync(new URL("./folio/classic-music-fx.tsx", import.meta.url), "utf8");
const music = readFileSync(new URL("./folio/music-style-control.tsx", import.meta.url), "utf8");

describe("classic music fx markup", () => {
  it("renders only for the classic skins with unique defs ids", () => {
    expect(fx).toMatch(/engraving/);
    expect(fx).toMatch(/watercolor/);
    expect(fx).toMatch(/ink/);
    expect(fx).toMatch(/useId/);
    expect(fx).toMatch(/viewBox="-40 -50 180 160"/);
    expect(fx).toMatch(/aria-hidden/);
    expect(fx).toMatch(/<g className="h"/);
    expect(fx).toMatch(/<g className="c"/);
    expect(fx).toMatch(/mfx sk-/);
  });

  it("builds hover notes from the prototype note/pair values", () => {
    expect(fx).toMatch(/x=\{92\} y=\{30\}/);
    expect(fx).toMatch(/x=\{104\} y=\{54\}/);
    expect(fx).toMatch(/x=\{84\} y=\{46\}/);
    expect(fx).toMatch(/x=\{98\} y=\{32\}/);
    expect(fx).toMatch(/x=\{112\} y=\{18\}/);
    expect(fx).toMatch(/x=\{86\} y=\{30\}/);
    expect(fx).toMatch(/strokeWidth: *3\.2/);
  });

  it("plays the orchestra swirls and ride notes on click", () => {
    expect(fx).toMatch(/M-30 78C0 40 34 104 64 66S112 24 136 44/);
    expect(fx).toMatch(/M-32 50C-4 24 28 70 58 40S106 0 132 14/);
    expect(fx).toMatch(/M-26 98C6 74 40 118 72 92S118 64 134 74/);
    expect(fx).toMatch(/className="ln sw draw"/);
    expect(fx).toMatch(/cls="ride"/);
  });

  it("keeps the piano inside the art box with pop notes above the keys", () => {
    expect(fx).toMatch(/y="76"/);
    expect(fx).toMatch(/height="22"/);
    expect(fx).toMatch(/height="13"/);
    expect(fx).toMatch(/width="13"/);
    expect(fx).toMatch(/width="8"/);
    expect(fx).not.toMatch(/y="-34"/);
    expect(fx).not.toMatch(/y=\{-38/);
    expect(fx).toMatch(/--dx/);
    expect(fx).toMatch(/--dy/);
    expect(fx).toMatch(/--r/);
  });

  it("draws the chopin ring and keeps the ink circle while current", () => {
    expect(fx).toMatch(/M50 9C72 7 91 24 90 48/);
    expect(fx).toMatch(/className="ln ring draw"/);
    expect(fx).toMatch(/cls="burst"/);
    expect(fx).toMatch(/keep/);
    expect(fx).toMatch(/strokeWidth: *2/);
  });

  it("never sends the click signature outside y -8..104", () => {
    expect(fx).not.toMatch(/y="-34"/);
    expect(fx).not.toMatch(/y=\{104\}/);
    expect(fx).toMatch(/Pair x=\{70\} y=\{96\}/);
  });
});

describe("classic music fx stylesheet", () => {
  it("sizes the overlay over the button image and keeps it unclipped", () => {
    expect(css).toMatch(/left: *-40%/);
    expect(css).toMatch(/top: *-50%/);
    expect(css).toMatch(/width: *180%/);
    expect(css).toMatch(/height: *160%/);
    expect(css).toMatch(/pointer-events: *none/);
    expect(css).toMatch(/overflow: *visible/);
    expect(css).toMatch(/position: *relative/);
  });

  it("uses Meta blue only, never purple", () => {
    expect(css).toMatch(/#0866FF/);
    expect(css).toMatch(/#0A3F9E/);
    expect(css).toMatch(/#8DB8FF/);
    expect(css).not.toMatch(/purple/i);
    expect(css).not.toMatch(/violet/i);
  });

  it("floats hover notes once with prototype durations", () => {
    expect(css).toMatch(/mfx-rise 0?\.95s/);
    expect(css).toMatch(/calc\(var\(--i\) \* 140ms\)/);
    expect(css).toMatch(/mfx-step 0?\.8s/);
    expect(css).toMatch(/calc\(var\(--i\) \* 110ms\)/);
    expect(css).toMatch(/mfx-pair 1\.05s/);
    expect(css).toMatch(/calc\(var\(--i\) \* 160ms\)/);
    expect(css).toMatch(/animation-duration: *1\.25s/);
  });

  it("plays each click signature on data-burst with prototype values", () => {
    expect(css).toMatch(/\[data-burst\][\s\S]*?\.c *> *\.sw/);
    expect(css).toMatch(/mfx-draw 1\.1s/);
    expect(css).toMatch(/calc\(var\(--i\) \* 90ms\)/);
    expect(css).toMatch(/mfx-ride 1\.1s/);
    expect(css).toMatch(/120ms \+ var\(--i\) \* 120ms/);
    expect(css).toMatch(/mfx-key 0?\.9s/);
    expect(css).toMatch(/calc\(var\(--i\) \* 65ms\)/);
    expect(css).toMatch(/mfx-ring 1\.3s/);
    expect(css).toMatch(/calc\(var\(--i\) \* 120ms\)/);
    expect(css).toMatch(/mfx-burst 0?\.9s/);
    expect(css).toMatch(/700ms \+ var\(--i\) \* 90ms/);
  });

  it("keeps the ink circle drawn while chopin is current", () => {
    expect(css).toMatch(/\.chopin\[aria-pressed="true"\][\s\S]*?\.mfx \.keep/);
    expect(css).toMatch(/mfx-keep 0?\.9s ease 0?\.05s/);
  });

  it("rests still and honours reduced motion", () => {
    expect(css).not.toMatch(/infinite/);
    expect(css).toMatch(/@media \(hover: *hover\)/);
    expect(css).toMatch(/prefers-reduced-motion/);
    expect(css).toMatch(/\.mfx \.h,[\s\S]*?\.mfx \.c \{\s*display: *none/);
    expect(css).toMatch(/animation: *none *!important/);
    expect(css).toMatch(/transition: *none *!important/);
  });
});

describe("classic music fx wiring", () => {
  it("renders ClassicMusicFx beside ButtonFx with the piano mapping", () => {
    expect(music).toMatch(/ClassicMusicFx/);
    expect(music).toMatch(/\/piano\/i/);
    expect(music).toMatch(/mode="chopin"/);
    expect(music).toMatch(/<ButtonFx kind="music"/);
  });

  it("replays the overlay on a burst key with an 1800ms data-burst flag", () => {
    expect(music).toMatch(/BURST_MS = 1800/);
    expect(music).toMatch(/data-burst=\{burstFor === s\.id \? "1" : undefined\}/);
    expect(music).toMatch(/data-burst=\{burstFor === playlist\.id \? "1" : undefined\}/);
    expect(music).toMatch(/key=\{burst\}/);
  });
});
