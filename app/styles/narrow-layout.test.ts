// Narrow reader (below 1024px): single column, condensed header, chat
// bottom sheet. No DOM setup in this repo, so the rules are pinned
// against the CSS source directly, like book-view-skin.test.ts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const folio = readFileSync(new URL("./folio.css", import.meta.url), "utf8");
const chat = readFileSync(new URL("./chat.css", import.meta.url), "utf8");
const home = readFileSync(new URL("../home/home.css", import.meta.url), "utf8");
const homeBring = readFileSync(new URL("../home/home-bring.css", import.meta.url), "utf8");
const homePlate = readFileSync(new URL("../home/home-plate.css", import.meta.url), "utf8");
const pictures = readFileSync(new URL("./pictures.css", import.meta.url), "utf8");
const chapters = readFileSync(new URL("./chapters.css", import.meta.url), "utf8");
const player = readFileSync(new URL("./player.css", import.meta.url), "utf8");
const narration = readFileSync(new URL("./narration.css", import.meta.url), "utf8");
const styleMenu = readFileSync(new URL("../style-menu.css", import.meta.url), "utf8");

// The @media (max-width: 1023px) block, brace-matched.
function narrow(css: string): string {
  const start = css.indexOf("@media (max-width: 1023px)");
  if (start < 0) throw new Error("no narrow block");
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css.charAt(i) === "{") depth++;
    else if (css.charAt(i) === "}") {
      depth--;
      if (depth === 0) return css.slice(open, i + 1);
    }
  }
  throw new Error("unbalanced narrow block");
}

describe("narrow reader layout", () => {
  it("stacks the folio into one column", () => {
    const css = narrow(folio);
    expect(css).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(css).toMatch(/grid-template-areas:\s*"top"\s*"pager"\s*"read"\s*"play"/);
  });

  it("hides the pane, divider and margin so the text keeps full width", () => {
    const css = narrow(folio);
    expect(css).toMatch(/\.img-pane,[\s\S]*?\.pane-divider,[\s\S]*?\.vault\s*\{[\s\S]*?display:\s*none/);
  });

  it("condenses the header instead of clipping it", () => {
    const css = narrow(folio);
    expect(css).toMatch(/\.top-line\s*\{[^}]*gap:\s*8px/);
    expect(css).toMatch(/\.wordmark\s*\{[^}]*font-size:\s*18px/);
    expect(css).toMatch(/\.style-menu-key\s*\{[^}]*display:\s*none/);
    expect(css).toMatch(/\.warmth input\s*\{[^}]*width:\s*44px/);
  });

  it("keeps the desktop grid above 1024px", () => {
    expect(folio).toContain("grid-template-columns: var(--pane-w) 12px minmax(0, 1fr) 200px");
  });
});

describe("narrow chat sheet", () => {
  it("shows the launcher instead of hiding chat", () => {
    expect(narrow(chat)).not.toMatch(/\.reader-chat\s*\{[^}]*display:\s*none/);
  });

  it("opens the panel as a bottom sheet", () => {
    const css = narrow(chat);
    expect(css).toMatch(/\.chat-panel\s*\{[^}]*position:\s*fixed/);
    expect(css).toMatch(/\.chat-panel\s*\{[^}]*max-height:\s*70dvh/);
    expect(css).toMatch(/\.chat-panel\s*\{[^}]*padding-bottom:\s*env\(safe-area-inset-bottom\)/);
  });

  it("hides the launcher while the sheet is open", () => {
    expect(narrow(chat)).toMatch(/\.reader-chat:has\(\.chat-panel\) \.chat-launch\s*\{[^}]*display:\s*none/);
  });

  it("turns the sheet animation off under prefers-reduced-motion", () => {
    expect(chat).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.chat-panel \{[\s\S]*?animation:\s*none !important/,
    );
  });

  it("keeps the desktop panel size", () => {
    expect(chat).toContain("width: 380px");
  });
});

describe("phone reader controls", () => {
  it("wraps the header instead of clipping it", () => {
    const css = narrow(folio);
    expect(css).toMatch(/\.top-line\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.top-center\s*\{[^}]*flex:\s*1 1 100%/);
  });

  it("steps the type down for a 360px column", () => {
    const css = narrow(folio);
    expect(css).toMatch(/\.body-text\s*\{[^}]*font-size:\s*18px/);
    expect(css).toMatch(/chapter-title\s*\{[^}]*font-size:\s*32px/);
  });

  it("wraps the audio band and keeps 44px header targets", () => {
    const css = narrow(folio);
    expect(css).toMatch(/\.band-play\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.pager-btn\s*\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.theme-btn\s*\{[^}]*width:\s*44px/);
  });

  it("carries a phone-only picture entry, hidden on desktop", () => {
    expect(folio).toMatch(/\.read-pictools\s*\{\s*display:\s*none/);
    const css = narrow(folio);
    expect(css).toMatch(/\.read-pictools\s*\{[^}]*display:\s*flex/);
    expect(css).toMatch(/\.read-picbtn\s*\{[^}]*min-height:\s*44px/);
  });

  it("pins the picture tools to the column top", () => {
    const css = narrow(folio);
    expect(css).toMatch(/\.read-pictools\s*\{[^}]*position:\s*sticky/);
    expect(css).toMatch(/\.read-pictools\s*\{[^}]*top:\s*0/);
    expect(css).toMatch(/\.read-pictools\s*\{[^}]*background:\s*var\(--color-surface\)/);
    expect(css).toMatch(/\.read-pictools\s*\{[^}]*z-index:\s*\d+/);
    expect(css).toMatch(/\.read-pictools\s*\{[^}]*env\(safe-area-inset-top\)/);
  });

  it("keeps 44px transport and sticker targets", () => {
    const css = narrow(player);
    expect(css).toMatch(/\.player \.skip\s*\{[^}]*width:\s*44px/);
    expect(css).toMatch(/\.sticker\s*\{[^}]*min-height:\s*44px/);
  });

  it("keeps a 44px read-aloud toggle", () => {
    expect(narrow(narration)).toMatch(/\.read-aloud-btn\s*\{[^}]*min-height:\s*44px/);
  });

  it("keeps 44px skin menu targets inside 360px", () => {
    const css = narrow(styleMenu);
    expect(css).toMatch(/\.style-menu-btn\s*\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.style-menu-list\s*\{[^}]*max-width:\s*calc\(100vw - 32px\)/);
    expect(css).toMatch(/\.style-menu-item\s*\{[^}]*min-height:\s*44px/);
  });
});

describe("phone pictures and panels", () => {
  it("fits the selection popover and inline controls in 360px", () => {
    const css = narrow(pictures);
    expect(css).toMatch(/\.picture-float\s*\{[^}]*max-width:\s*calc\(100vw - 24px\)/);
    expect(css).toMatch(/\.genfig \.grm\s*\{[^}]*width:\s*44px/);
  });

  it("fits the lightbox with a 44px close", () => {
    const css = narrow(pictures);
    expect(css).toMatch(/\.lightbox\s*\{[^}]*padding:\s*16px/);
    expect(css).toMatch(/\.lightbox-x\s*\{[^}]*width:\s*44px/);
  });

  it("stacks panels in one column with safe-area room", () => {
    const css = narrow(chapters);
    expect(css).toMatch(/\.panels-modal\s*\{[^}]*padding:\s*12px/);
    expect(css).toMatch(/\.panels-box\s*\{[^}]*max-height:\s*calc\(100dvh - 24px\)/);
    expect(css).toMatch(/\.panel-grid,\s*\.panel-grid\.two\s*\{[^}]*grid-template-columns:\s*1fr/);
    expect(css).toMatch(/\.panels-frame\s*\{[^}]*width:\s*100%/);
    expect(css).toMatch(/\.cover-num\s*\{[^}]*font-size:\s*4\.5rem/);
  });
});

describe("phone chat sheet", () => {
  it("keeps 44px send and close targets", () => {
    const css = narrow(chat);
    expect(css).toMatch(/\.chat-send\s*\{[^}]*width:\s*44px/);
    expect(css).toMatch(/\.chat-x\s*\{[^}]*width:\s*44px/);
  });

  it("sets the composer to 16px so phones do not auto-zoom", () => {
    expect(narrow(chat)).toMatch(/\.chat-ta\s*\{[^}]*font-size:\s*16px/);
  });
});

describe("phone home", () => {
  it("stacks the spread and scrolls the desk", () => {
    const css = narrow(home);
    expect(css).toMatch(/\.ob-book\s*\{[^}]*grid-template-columns:\s*1fr/);
    expect(css).toMatch(/\.ob-gutter\s*\{[^}]*display:\s*none/);
    expect(css).toMatch(/\.ob-desk\s*\{[^}]*overflow-y:\s*auto/);
  });

  it("fits the wordmark and covers in 360px", () => {
    const css = narrow(home);
    expect(css).toMatch(/\.ob-wordmark\s*\{[^}]*font-size:\s*40px/);
    expect(css).toMatch(/\.lb-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3, 1fr\)/);
  });

  it("keeps 44px actions, 16px inputs and a wrapping footer", () => {
    const css = narrow(homeBring);
    expect(css).toMatch(/\.ob-action,[\s\S]*?min-height:\s*44px/);
    expect(css).toMatch(/\.ob-foot\s*\{[^}]*white-space:\s*normal/);
    expect(css).toMatch(/font-size:\s*16px/);
  });

  it("compacts the plate art", () => {
    expect(narrow(homePlate)).toMatch(/\.ob-plate\s*\{[^}]*--art-h:/);
  });
});

// The six skins may only paint the reader chrome they restyle; layout
// props there would silently beat the narrow rules, which load earlier.
const SKINS = ["engraving", "watercolor", "ink", "pencil", "comic", "chihiro"] as const;
const NO_DISPLAY = ["img-pane", "pane-divider", "vault", "chat-launch"];
const NO_GEOMETRY = ["chat-panel", "reader-chat"];
const NO_GRID = ["folio", "read-col", "top-line", "band-play", "band-pager"];

function declsFor(css: string, cls: string): string[] {
  const out: string[] = [];
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const sel = new RegExp(`\\.${cls}(?![\\w-])`);
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = rule.exec(stripped))) {
    const selector = m[1] ?? "";
    const decls = m[2] ?? "";
    if (sel.test(selector)) out.push(decls);
  }
  return out;
}

describe.each(SKINS)("skin %s keeps the narrow layout", (skin) => {
  const css = readFileSync(new URL(`./skin-${skin}.css`, import.meta.url), "utf8");

  it("never un-hides a narrow-hidden column", () => {
    for (const cls of NO_DISPLAY) {
      for (const decls of declsFor(css, cls)) {
        expect(decls).not.toMatch(/display\s*:/);
      }
    }
  });

  it("never resizes or repositions the chat sheet", () => {
    for (const cls of NO_GEOMETRY) {
      for (const decls of declsFor(css, cls)) {
        expect(decls).not.toMatch(/(display|position|width|max-width|height|max-height)\s*:/);
      }
    }
  });

  it("never re-grids the folio", () => {
    for (const cls of NO_GRID) {
      for (const decls of declsFor(css, cls)) {
        expect(decls).not.toMatch(/(display|position|grid-template|grid-area)\s*:/);
      }
    }
  });
});
