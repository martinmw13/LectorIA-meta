import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The home upload page runs these modules in the browser, so they must
// stay free of node imports and env reads. The pipeline keeps its own
// node clients and injects them (DOMParser, judges, file writes).
const CLIENT_SAFE = [
  "core/clean.ts",
  "core/clean-rules.ts",
  "core/clean-types.ts",
  "core/clean-txt.ts",
  "core/epub.ts",
];

describe("client-safe core", () => {
  it("has no node: imports and no env reads", () => {
    for (const file of CLIENT_SAFE) {
      const text = readFileSync(join(process.cwd(), file), "utf8");
      for (const line of text.split("\n")) {
        if (/^\s*import[ (]/.test(line)) expect(line, file).not.toContain("node:");
      }
      expect(text, file).not.toContain("process.env");
    }
  });
});
