// Left home page: tall upload states (the key step, progress) must
// scroll inside the page instead of overlapping the shelf and footer.
// jsdom does no layout, so the rules are pinned against the CSS
// source directly, like narrow-layout.test.ts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./home.css", import.meta.url), "utf8");
const bring = readFileSync(new URL("./home-bring.css", import.meta.url), "utf8");

describe("left page overflow", () => {
  it("scrolls tall content inside the page", () => {
    expect(css).toMatch(/\.ob-left\s*\{[^}]*overflow-y:\s*auto/);
  });

  it("keeps children at natural height so nothing overlaps", () => {
    expect(css).toMatch(/\.ob-left > \*\s*\{[^}]*flex-shrink:\s*0/);
  });

  it("keeps the footer below the content", () => {
    expect(bring).toMatch(/\.ob-foot\s*\{[^}]*margin-top:\s*auto/);
  });

  it("no skin disables the page scroll", () => {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = /([^{}]+)\{([^{}]*)\}/g;
    let m: RegExpExecArray | null;
    let checked = 0;
    while ((m = rule.exec(stripped))) {
      if (/html\[data-skin=[^\]]+\]\s+\.ob-left(?![\w-])/.test(m[1] ?? "")) {
        checked++;
        expect(m[2]).not.toMatch(/overflow(-y)?\s*:/);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
