import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Pins the approved-prototype button motion values against the per-family
// motion stylesheets (app/styles/motion-*.css), the shared overlay
// (app/button-fx.tsx) and the components that trigger it. No DOM setup in
// this repo: every assertion reads the sources directly.
const classic = readFileSync(new URL("./styles/motion-classic.css", import.meta.url), "utf8");
const pencil = readFileSync(new URL("./styles/motion-pencil.css", import.meta.url), "utf8");
const comic = readFileSync(new URL("./styles/motion-comic.css", import.meta.url), "utf8");
const icons = readFileSync(new URL("./styles/motion-icons.css", import.meta.url), "utf8");
const motion = [classic, pencil, comic, icons].join("\n");
const fx = readFileSync(new URL("./button-fx.tsx", import.meta.url), "utf8");
const player = readFileSync(new URL("./player.tsx", import.meta.url), "utf8");
const pager = readFileSync(new URL("./folio/chrome.tsx", import.meta.url), "utf8");
const music = readFileSync(new URL("./folio/music-style-control.tsx", import.meta.url), "utf8");
const rain = readFileSync(new URL("./rain-button.tsx", import.meta.url), "utf8");
const readAloud = readFileSync(new URL("./narration/read-aloud.tsx", import.meta.url), "utf8");
const picture = readFileSync(new URL("./folio/picture-button.tsx", import.meta.url), "utf8");

describe("prototype button motion values", () => {
  it("keeps the engraving tokens and coin-in verbatim", () => {
    expect(classic).toMatch(/html\[data-skin="engraving"\] \{\s*--m-fast:\s*160ms/);
    expect(classic).toMatch(/--m-state:\s*520ms/);
    expect(classic).toMatch(/--ease:\s*cubic-bezier\(\.2,\.7,\.2,1\)/);
    expect(classic).toMatch(/--face-in:\s*coin-in/);
    expect(classic).toMatch(/--press:\s*engrave-press/);
    expect(classic).toMatch(/rotateY\(-95deg\)/);
    expect(classic).toMatch(/engrave-press/);
  });

  it("runs the engraving shim at .55 opacity with a 900ms linear shimmer", () => {
    expect(classic).toMatch(/opacity: 0\.55/);
    expect(classic).not.toMatch(/opacity: 0\.[69][^0-9]/);
    expect(classic).toMatch(/shimmer 900ms linear/);
    expect(classic).toMatch(/translate\(-9px, 9px\)/);
    expect(classic).not.toMatch(/translate\(-12px, 12px\)/);
  });

  it("keeps the watercolor tokens, wet-in blur and 600ms bleed verbatim", () => {
    expect(classic).toMatch(/html\[data-skin="watercolor"\] \{\s*--m-fast:\s*200ms/);
    expect(classic).toMatch(/--m-state:\s*560ms/);
    expect(classic).toMatch(/--face-in:\s*wet-in/);
    expect(classic).toMatch(/--press:\s*wet-press/);
    expect(classic).toMatch(/blur\(5px\) saturate\(0\.5\)/);
    expect(classic).toMatch(/bleed 600ms/);
    expect(classic).toMatch(/scale\(1\.08\)/);
    expect(classic).toMatch(/scale\(1\.04\)/);
  });

  it("keeps the ink wiggle (-2.4/2/-1, 420ms) and pop-in (1.05, 440ms)", () => {
    expect(classic).toMatch(/html\[data-skin="ink"\] \{\s*--m-fast:\s*150ms/);
    expect(classic).toMatch(/--m-state:\s*440ms/);
    expect(classic).toMatch(/rotate\(-2\.4deg\)/);
    expect(classic).toMatch(/rotate\(2deg\)/);
    expect(classic).toMatch(/rotate\(-1deg\)/);
    expect(classic).toMatch(/wiggle 420ms ease/);
    expect(classic).not.toMatch(/rotate\(-3deg\)/);
    expect(classic).not.toMatch(/rotate\(2\.4deg\)/);
    expect(classic).toMatch(/scale\(1\.05\) rotate\(1deg\)/);
    expect(classic).not.toMatch(/scale\(1\.06\) rotate\(1deg\)/);
    expect(classic).toMatch(/pop-in var\(--m-state\)/);
    expect(classic).toMatch(/stamp-thump/);
  });

  it("drips and flashes the classic rain with prototype delays", () => {
    expect(classic).toMatch(/drip 0\.5s var\(--ease\) calc\(160ms \+ var\(--i\) \* 45ms\) both/);
    expect(classic).toMatch(/drip-h 0?\.7s var\(--ease\) calc\(var\(--i\) \* 40ms\)/);
    expect(classic).toMatch(/flash 0\.55s 0\.25s both/);
    expect(classic).toMatch(/flash-h 0\.5s/);
  });

  it("presses classic icon and picture buttons for 380ms", () => {
    expect(icons).toMatch(/\[data-press\] \{\s*animation: var\(--press\) 380ms var\(--ease\);\s*\}/);
    expect(classic).toMatch(/\.pic-btn\[data-press\][\s\S]*?animation: var\(--press\) 380ms/);
    expect(icons).toMatch(/:active \{\s*transform: scale\(0?\.9\);\s*\}/);
  });

  it("lifts pencil/chihiro art -5px/-3deg on a .22s spring with a proto ground", () => {
    expect(pencil).toMatch(/--spring:\s*cubic-bezier\(\.34,1\.56,\.64,1\)/);
    expect(pencil).toMatch(/translateY\(-5px\) rotate\(-3deg\)/);
    expect(pencil).toMatch(/transform 0\.22s var\(--spring\)/);
    expect(pencil).toMatch(/transform-origin: 50% 75%/);
    expect(pencil).toMatch(/translateY\(1px\) scale\(0?\.93\)/);
    expect(pencil).toMatch(/transition-duration: 0\.08s/);
    expect(pencil).toMatch(/radial-gradient\(closest-side,var\(--ground,rgba\(\s*60,\s*90,\s*60,\s*0?\.22\s*\)\),transparent\)/);
    expect(pencil).toMatch(/settle 0?\.55s var\(--spring\)/);
  });

  it("plays the pencil/chihiro particles with prototype durations and delays", () => {
    expect(pencil).toMatch(/pencil-drop 0\.75s var\(--ease\) calc\(var\(--i\) \* 70ms\)/);
    expect(pencil).toMatch(/pencil-note 0\.9s var\(--ease\) calc\(var\(--i\) \* 140ms\)/);
    expect(pencil).toMatch(/pencil-glint 0\.6s var\(--ease\) calc\(var\(--i\) \* 110ms\)/);
    expect(pencil).toMatch(/pencil-wave2 0\.7s var\(--ease\) calc\(var\(--i\) \* 110ms\)/);
    expect(pencil).toMatch(/pencil-fly 1\.1s var\(--ease\) calc\(var\(--i\) \* 120ms\)/);
    expect(pencil).toMatch(/pencil-paint 0\.8s var\(--ease\)/);
    expect(pencil).toMatch(/pencil-gust 0\.8s var\(--ease\) calc\(var\(--i\) \* 90ms\)/);
    expect(pencil).toMatch(/\.fx \* \{[\s\S]*?transform-box:\s*fill-box/);
    expect(pencil).toMatch(/inset: -18%/);
    expect(pencil).toMatch(/width: 136%/);
  });

  it("builds the shared fx overlay from the prototype markup", () => {
    expect(fx).toMatch(/viewBox="0 0 136 136"/);
    expect(fx).toMatch(/aria-hidden/);
    expect(fx).toMatch(/l-3 9/);
    expect(fx).toMatch(/#55595F/);
    expect(fx).toMatch(/v-14l9-3v14/);
    expect(fx).toMatch(/M100 56c5 6 5 18 0 24/);
    expect(fx).toMatch(/M18 112C40 98 62 104 80 110S112 116 124 100/);
    expect(fx).toMatch(/#B9BCC1/);
    expect(fx).toMatch(/#FFC25A/);
    expect(fx).toMatch(/--dx/);
    expect(fx).not.toContain("mode-notes");
  });

  it("snaps comic art in two hard frames with POW values", () => {
    expect(comic).toMatch(/steps\(2, ?end\)/);
    expect(comic).toMatch(/rotate\(-4deg\) scale\(1\.06\)/);
    expect(comic).toMatch(/transform 0\.12s steps\(2, ?end\)/);
    expect(comic).toMatch(/scale\(0?\.55\) rotate\(-12deg\)/);
    expect(comic).toMatch(/scale\(1\.16\) rotate\(4deg\)/);
    expect(comic).toMatch(/comic-pow 0\.38s cubic-bezier\(\.3,1\.6,\.5,1\)/);
    expect(comic).toMatch(/comic-burst-in 0\.26s cubic-bezier\(\.3,1\.6,\.5,1\) both/);
    expect(comic).toMatch(/comic-burst-flash 0\.5s ease-out/);
    expect(comic).toMatch(/comic-c-paint 0\.35s steps\(4, ?end\)/);
    expect(comic).toMatch(/comic-drip 0\.5s var\(--ease\) calc\(120ms \+ var\(--i\) \* 45ms\) both/);
    expect(comic).toMatch(/comic-flash 0\.55s 0\.2s both/);
    expect(comic).toMatch(/comic-flash-h 0\.5s/);
    expect(comic).toMatch(/\.skip\.rain\[data-anim\] \.drop/);
    expect(comic).not.toMatch(/scale\(0?\.6\) rotate\(-8deg\)/);
  });

  it("slides pencil/chihiro glyphs sideways and stills comic icons", () => {
    expect(icons).toMatch(/translateX\(var\(--nx, ?0\)\)/);
    expect(icons).toMatch(/--nx: -2px/);
    expect(icons).toMatch(/--nx: 2px/);
    expect(icons).toMatch(/scale\(0?\.88\)/);
    expect(icons).toMatch(/translateY\(-1px\)/);
  });

  it("triggers one-shots from every button", () => {
    expect(music).toMatch(/data-anim=\{anim === s\.id/);
    expect(rain).toMatch(/data-anim=\{burst \? "1" : undefined\}/);
    expect(readAloud).toMatch(/data-anim=\{anim \? "1" : undefined\}/);
    expect(picture).toMatch(/data-press=\{press \? "1" : undefined\}/);
    expect(player).toMatch(/pressButton\(e\)/);
    expect(pager).toMatch(/pressButton\(e\)/);
    expect(fx).toMatch(/dataset\.press/);
  });

  it("renders the fx overlay from every art button for pencil/chihiro", () => {
    for (const src of [music, rain, readAloud, picture]) {
      expect(src).toMatch(/<ButtonFx kind="(music|rain|narrate|picture)"/);
    }
  });

  it("keeps motion still at rest with reduced-motion fallbacks", () => {
    expect(motion).not.toMatch(/infinite/);
    for (const file of [classic, pencil, comic, icons]) {
      expect(file).toMatch(/prefers-reduced-motion/);
    }
    expect(motion).toMatch(/fade-in 200ms/);
    expect(pencil).toMatch(/\.fx:not\(\.waves\) \{\s*display: none/);
  });

  it("renders the clear-day gusts in the chihiro theme extra", () => {
    expect(fx).toMatch(/M4 44c18-10 34 4 52-2s26-12 38-4/);
    expect(fx).toMatch(/M20 62c14-6 26 2 40 0s22-8 30-2/);
    expect(fx).toMatch(/#7CC6BA/);
    expect(fx).toMatch(/#A9D8F2/);
    expect(fx).toMatch(/M118 26c3 4 8 4 10 0-4-1-7 1-10 0z/);
    expect(fx).toMatch(/#D2452E/);
    expect(fx).toMatch(/#FFC25A/);
  });

  it("shows still sound waves while narration is on", () => {
    expect(fx).toMatch(/fx waves/);
    expect(fx).toMatch(/strokeWidth="3\.2"/);
    expect(readAloud).toMatch(/<ButtonFx kind="narrate"[^>]*on=\{on\}/);
    expect(pencil).toMatch(/pencil-wave2in 0\.5s var\(--ease\) calc\(var\(--i\) \* 90ms\) both/);
    expect(pencil).toMatch(/from \{\s*opacity: 0; transform: translateX\(-5px\)/);
    expect(pencil).toMatch(/\.fx\.waves path \{\s*opacity: 1/);
  });

  it("replays clicks on a burst key with an 1800ms data-burst flag", () => {
    for (const src of [music, readAloud, picture]) {
      expect(src).toMatch(/BURST_MS = 1800/);
      expect(src).toMatch(/data-burst/);
      expect(src).toMatch(/key=\{burst\}/);
    }
    // The flag clears but the key never resets, so nothing remounts later.
    for (const src of [music, readAloud, picture]) expect(src).not.toMatch(/setBurst\(0\)/);
    // Rain was approved as it is: it keeps its own 1400ms data-anim only.
    expect(rain).not.toMatch(/data-burst/);
    expect(rain).toMatch(/data-anim=\{burst \? "1" : undefined\}/);
  });
});
