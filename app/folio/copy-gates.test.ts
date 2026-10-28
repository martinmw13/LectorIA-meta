// Copy gates for chapter panels: the panels name lives in one const,
// user copy never says Generated, and Meta blue stays the only accent.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function sources(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.(tsx?|css)$/.test(name) || /\.test\.[jt]sx?$/.test(name)) continue;
      out.push({ path, text: readFileSync(path, "utf8") });
    }
  };
  walk(join(root, "app"));
  walk(join(root, "core"));
  return out;
}

const PURPLES = new Set(
  ["800080", "8e44ad", "9b59b6", "a855f7", "7c3aed", "6d28d9", "9333ea", "5b21b6", "4c1d95", "c084fc", "d8b4fe", "e9d5ff", "ee82ee", "9400d3", "9370db", "663399"],
);

describe("chapter panels copy gates", () => {
  it("names the panels view exactly once across app and core sources", () => {
    const files = sources();
    const hits = files.filter((f) => f.text.includes("Picture the chapter in panels")).map((f) => f.path);
    expect(hits).toEqual([join(root, "app", "folio", "panels.ts")]);
  });

  it("never says Generated in user sources", () => {
    const hits = sources()
      .filter((f) => f.text.includes("Generated"))
      .map((f) => f.path);
    expect(hits).toEqual([]);
  });

  it("uses no purple hex anywhere in app or core", () => {
    const hits: string[] = [];
    for (const f of sources()) {
      for (const m of f.text.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
        if (PURPLES.has(m[1]?.toLowerCase() ?? "")) hits.push(`${f.path}: ${m[0]}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
