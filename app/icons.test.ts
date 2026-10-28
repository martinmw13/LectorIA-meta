import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BASE_ICONS, ICON_SETS, Icon, type IconName } from "./icons";
import { hasRainArt } from "./icons-rain";
import { DEFAULT_SKIN, SKINS } from "./skin";

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

  it("resolves every rain state for every skin, falling back to the default art", () => {
    expect(readFileSync(new URL("./icons-rain.tsx", import.meta.url), "utf8")).not.toContain(
      "dangerouslySetInnerHTML",
    );
    const rains: IconName[] = ["rain-off", "rain-drizzle", "rain-moderate", "rain-storm"];
    for (const name of rains) {
      for (const skin of SKINS) {
        const html = renderToStaticMarkup(createElement(Icon, { name, skin }));
        expect(html).toContain('viewBox="0 0 100 100"');
        expect(html).toContain('aria-hidden="true"');
        if (!hasRainArt(skin)) {
          expect(html).toBe(renderToStaticMarkup(createElement(Icon, { name, skin: DEFAULT_SKIN })));
        }
      }
    }
  });

  it("ships rain art only for the three rain skins", () => {
    expect(hasRainArt("engraving")).toBe(true);
    expect(hasRainArt("watercolor")).toBe(true);
    expect(hasRainArt("ink")).toBe(true);
    expect(hasRainArt("comic")).toBe(false);
    expect(hasRainArt("anime-ghibli")).toBe(false);
    const rains: IconName[] = ["rain-off", "rain-drizzle", "rain-moderate", "rain-storm"];
    const seen = new Set<string>();
    for (const name of rains) {
      for (const skin of ["engraving", "watercolor", "ink"] as const) {
        seen.add(renderToStaticMarkup(createElement(Icon, { name, skin })));
      }
    }
    expect(seen.size).toBe(rains.length * 3);
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
