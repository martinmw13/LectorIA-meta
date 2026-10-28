import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseManifest } from "./music";

// The committed placeholder manifest must parse and every src must exist.
describe("committed music manifest", () => {
  it("parses and every file src exists under public/", () => {
    const raw = readFileSync(join(__dirname, "..", "public", "music", "manifest.json"), "utf8");
    const manifest = parseManifest(JSON.parse(raw));
    expect(manifest.version).toBe(2);
    expect(manifest.tracks.length).toBeGreaterThan(0);
    for (const track of manifest.tracks) {
      if (track.src.startsWith("/")) {
        expect(existsSync(join(__dirname, "..", "public", track.src))).toBe(true);
      }
    }
    const ids = manifest.tracks.map((t) => t.id);
    expect(ids).toContain("oz-test-01");
    expect(ids).toContain("oz-test-02");
    const suspenso = manifest.tracks.find((t) => t.id === "oz-test-02");
    expect(suspenso?.emotion).toBe("suspenso");
    expect(suspenso?.loop).toBe(true);
    expect(suspenso?.startSec).toBe(0);
    expect(suspenso?.source).toBe("generated");
    expect(suspenso?.license).toBe("CC-BY-NC-4.0");
  });
});
