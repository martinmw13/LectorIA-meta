import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BASE_ICONS, ICON_SETS, Icon, type IconName } from "./icons";
import { SKINS } from "./skin";

// app/player.tsx keeps its inline SVGs until its open PR lands, then it
// migrates to the registry.
const ALLOWLIST = new Set(["app/icons.tsx", "app/player.tsx"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

describe("icon registry", () => {
  it("renders base icons byte-identical for every skin", () => {
    const names = Object.keys(BASE_ICONS);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const first = renderToStaticMarkup(createElement(Icon, { name: name as IconName, skin: SKINS[0] }));
      for (const skin of SKINS) {
        expect(renderToStaticMarkup(createElement(Icon, { name: name as IconName, skin }))).toBe(first);
      }
    }
  });

  it("falls back to the base set for names a skin does not override", () => {
    const names = Object.keys(BASE_ICONS);
    for (const name of names) {
      const html = renderToStaticMarkup(createElement(Icon, { name: name as IconName }));
      expect(html.startsWith("<svg")).toBe(true);
    }
  });

  it("resolves every rain state to a skin-specific def for every skin", () => {
    expect(readFileSync(new URL("./icons-rain.tsx", import.meta.url), "utf8")).not.toContain(
      "dangerouslySetInnerHTML",
    );
    const rains: IconName[] = ["rain-off", "rain-drizzle", "rain-moderate", "rain-storm"];
    for (const name of rains) {
      const seen = new Set<string>();
      for (const skin of SKINS) {
        const html = renderToStaticMarkup(createElement(Icon, { name, skin }));
        expect(html).toContain('viewBox="0 0 100 100"');
        expect(html).toContain('aria-hidden="true"');
        seen.add(html);
      }
      expect(seen.size).toBe(SKINS.length);
    }
  });

  it("carries the class hooks the rain CSS animates", () => {
    for (const skin of SKINS) {
      const storm = renderToStaticMarkup(createElement(Icon, { name: "rain-storm", skin }));
      for (const cls of ["halo", "drop", "bolt"]) {
        expect(storm).toContain(cls);
      }
      expect(storm).toContain("--i");
      const off = renderToStaticMarkup(createElement(Icon, { name: "rain-off", skin }));
      expect(off).not.toContain("bolt");
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
