import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseManifest } from "./music";

function track(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "seg-01",
    src: "/music/placeholder/oz-test-01-calma-t01.mp3",
    title: "Segment",
    emotion: "calma",
    vector: {
      calma: 1,
      alegria: 0,
      tristeza: 0,
      suspenso: 0,
      misterio: 0,
      aventura: 0,
      combate: 0,
      asombro: 0,
    },
    intensity: 0.5,
    tempo: 0.5,
    durationSec: 10,
    soundtrack: "placeholder-musicgen",
    style: "orchestral",
    ...overrides,
  };
}

function manifestWith(tracks: Record<string, unknown>[]): unknown {
  return {
    version: 3,
    styles: [{ id: "orchestral", name: "Orchestra" }],
    soundtracks: [{ id: "placeholder-musicgen", name: "Placeholder", style: "orchestral" }],
    tracks,
  };
}

// The committed manifest must parse and every src must exist.
describe("committed music manifest", () => {
  it("parses and every file src exists under public/", () => {
    const raw = readFileSync(join(__dirname, "..", "public", "music", "manifest.json"), "utf8");
    const manifest = parseManifest(JSON.parse(raw));
    expect(manifest.version).toBe(3);
    expect(manifest.styles).toEqual([
      { id: "orchestral", name: "Orchestra" },
      { id: "piano", name: "Piano" },
    ]);
    expect(manifest.tracks.length).toBeGreaterThan(0);
    for (const track of manifest.tracks) {
      if (track.src.startsWith("/")) {
        expect(existsSync(join(__dirname, "..", "public", track.src))).toBe(true);
      }
    }
    // Real recordings: every track credits its source, remote audio
    // comes only from the Blob store host allowed in media-src.
    for (const track of manifest.tracks) {
      if (track.src.startsWith("https://")) {
        expect(new URL(track.src).host).toBe("3vuhzq2wmortnuxj.public.blob.vercel-storage.com");
      }
      expect(track.attribution).toBeTruthy();
      expect(track.sourceUrl).toMatch(/^https:\/\//);
    }
    const chopin = manifest.playlists.find((p) => p.id === "just-play-chopin");
    expect(chopin?.label).toBe("Just play Chopin");
    // The four Ballades plus 18 of the best-known works, each id a
    // playlist-only track in the manifest.
    expect(chopin?.trackIds).toHaveLength(22);
    const playlistOnly = new Set(manifest.tracks.filter((t) => t.playlistOnly).map((t) => t.id));
    for (const id of chopin?.trackIds ?? []) expect(playlistOnly.has(id)).toBe(true);
  });
});

describe("gainDb and endSec", () => {
  it("accepts and keeps both when in range", () => {
    const parsed = parseManifest(manifestWith([track({ gainDb: -10, endSec: 6 })]));
    expect(parsed.tracks[0]?.gainDb).toBe(-10);
    expect(parsed.tracks[0]?.endSec).toBe(6);
    const edges = parseManifest(
      manifestWith([track({ id: "a", gainDb: -24 }), track({ id: "b", gainDb: 12 })]),
    );
    expect(edges.tracks[0]?.gainDb).toBe(-24);
    expect(edges.tracks[1]?.gainDb).toBe(12);
  });

  it("rejects gainDb outside -24..12 and names the track", () => {
    for (const gainDb of [13, -24.5, Number.NaN, Infinity]) {
      expect(() => parseManifest(manifestWith([track({ gainDb })]))).toThrow("seg-01");
    }
  });

  it("rejects endSec at or below startSec and past the track", () => {
    expect(() => parseManifest(manifestWith([track({ startSec: 4, endSec: 4 })]))).toThrow(
      "seg-01",
    );
    expect(() => parseManifest(manifestWith([track({ endSec: 0 })]))).toThrow("seg-01");
    expect(() => parseManifest(manifestWith([track({ endSec: 11 })]))).toThrow("seg-01");
  });

  it("ignores unknown converter fields and takes https srcs without fetching", () => {
    const parsed = parseManifest(
      manifestWith([
        track({ src: "https://3vuhzq2wmortnuxj.public.blob.vercel-storage.com/music/v1/x.mp3" }),
        { ...track({ id: "seg-02" }), provisional: true, labelId: "lab-1" },
      ]),
    );
    expect(parsed.tracks).toHaveLength(2);
  });
});
