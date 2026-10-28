import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ICON_SETS, Icon, type IconName } from "./icons";
import { SKINS } from "./skin";

// app/player.tsx and app/rain-button.tsx keep their inline SVGs until
// their open PRs land, then they migrate to the registry.
const ALLOWLIST = new Set(["app/icons.tsx", "app/player.tsx", "app/rain-button.tsx"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

describe("icon registry", () => {
  it("resolves every name for every skin with identical svg markup", () => {
    const names = Object.keys(ICON_SETS.default) as IconName[];
    expect(names.length).toBeGreaterThan(0);
    for (const skin of SKINS) {
      for (const name of names) {
        const html = renderToStaticMarkup(createElement(Icon, { name, skin }));
        expect(html).toContain("viewBox=");
        expect(html).toContain('aria-hidden="true"');
      }
    }
  });

  it("falls back to the default set for names a skin does not override", () => {
    const names = Object.keys(ICON_SETS.default) as IconName[];
    for (const name of names) {
      const html = renderToStaticMarkup(createElement(Icon, { name }));
      expect(html.startsWith("<svg")).toBe(true);
    }
  });

  it("keeps inline SVGs only in the registry and the allowlist", () => {
    const probe = "<" + "svg";
    const bad: string[] = [];
    for (const file of walk("app")) {
      if (!file.endsWith(".tsx") || ALLOWLIST.has(file)) continue;
      if (readFileSync(file, "utf8").includes(probe)) bad.push(file);
    }
    expect(bad).toEqual([]);
  });
});
