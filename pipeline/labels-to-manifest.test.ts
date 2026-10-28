import { describe, expect, it } from "vitest";
import { parseManifest } from "../core/music-manifest";
import { labelsToManifest } from "./labels-to-manifest";

const HOST = "https://3vuhzq2wmortnuxj.public.blob.vercel-storage.com";

function labels() {
  return {
    schemaVersion: 2,
    tracks: [
      { trackId: "lab-todo", status: "todo", style: "orchestral" },
      { trackId: "lab-good", status: "validated", style: "piano" },
      { trackId: "lab-nd", status: "relabeled", style: "orchestral" },
      { trackId: "lab-old", status: "discarded", style: "orchestral" },
      { trackId: "lab-missing", status: "validated", style: "orchestral" },
      { trackId: "lab-moved", status: "validated", style: "piano" },
    ],
    segments: [
      { trackId: "lab-todo", segmentId: "seg-a1", startSec: 10, endSec: 50, primary: "calma", intensity: 1, tempo: 5 },
      { trackId: "lab-todo", segmentId: "seg-a2", startSec: 60, endSec: 100, primary: "alegria", intensity: 3, tempo: 3 },
      {
        trackId: "lab-good",
        segmentId: "seg-b1",
        startSec: 0,
        endSec: 30,
        primary: "tristeza",
        vector: { calma: 0.25555, tristeza: 0.8, aventura: 1.5 },
        intensity: 5,
        tempo: 1,
      },
      { trackId: "lab-nd", segmentId: "seg-c1", startSec: 5, endSec: 35, primary: "calma", intensity: 2, tempo: 2 },
      { trackId: "lab-nd", segmentId: "seg-c2", startSec: 40, endSec: 120, primary: "aventura", intensity: 4, tempo: 4 },
      { trackId: "lab-old", segmentId: "seg-d1", startSec: 0, endSec: 20, primary: "calma", intensity: 3, tempo: 3 },
      { trackId: "lab-missing", segmentId: "seg-e1", startSec: 0, endSec: 20, primary: "calma", intensity: 3, tempo: 3 },
      { trackId: "lab-moved", segmentId: "seg-f1", startSec: 0, endSec: 20, primary: "calma", intensity: 3, tempo: 3 },
    ],
  };
}

function library() {
  return {
    version: 1,
    styles: [
      { id: "orchestral", name: "Orquesta" },
      { id: "piano", name: "Piano" },
    ],
    soundtracks: [
      { id: "st-orch", name: "Orchestra", style: "orchestral" },
      { id: "st-piano", name: "Piano", style: "piano" },
    ],
    entries: {
      "lab-todo": {
        src: `${HOST}/music/v1/st-orch/a.mp3`,
        soundtrack: "st-orch",
        durationSec: 200,
        gainDb: -10,
        title: "Todo track",
        composer: "Comp",
        license: "CC-BY-NC-4.0",
      },
      "lab-good": {
        src: `${HOST}/music/v1/st-piano/b.mp3`,
        soundtrack: "st-piano",
        durationSec: 120,
        title: "Good track",
        source: "jamendo",
        sourceUrl: "https://example.com/b",
      },
      "lab-nd": {
        src: `${HOST}/music/v1/st-orch/c.mp3`,
        soundtrack: "st-orch",
        durationSec: 200,
        noDerivatives: true,
        gainDb: 5,
        title: "ND track",
        artist: "Someone",
      },
      "lab-moved": {
        src: `${HOST}/music/v1/st-orch/f.mp3`,
        soundtrack: "st-orch",
        durationSec: 100,
        title: "Moved track",
      },
    },
    extraTracks: [
      {
        id: "chopin-1",
        src: "/music/chopin/ballade-1.mp3",
        title: "Ballade 1",
        playlistOnly: true,
        emotion: "tristeza",
        vector: { calma: 0, alegria: 0, tristeza: 1, suspenso: 0, misterio: 0, aventura: 0, combate: 0, asombro: 0 },
        intensity: 0.5,
        tempo: 0.5,
        durationSec: 100,
        startSec: 0,
        loop: false,
        soundtrack: "st-piano",
        style: "piano",
      },
    ],
    playlists: [{ id: "just-play-chopin", label: "Just play Chopin", trackIds: ["chopin-1"] }],
  };
}

describe("labelsToManifest", () => {
  it("converts segments, sorts, and appends extras", () => {
    const { manifest, warnings } = labelsToManifest(labels(), library());
    expect(manifest.tracks.map((t) => t.id)).toEqual([
      "lab-nd",
      "seg-a1",
      "seg-a2",
      "lab-good",
      "chopin-1",
    ]);
    const a1 = manifest.tracks[1]!;
    expect(a1.labelId).toBe("lab-todo");
    expect(a1.provisional).toBe(true);
    expect(a1.emotion).toBe("calma");
    expect(a1.startSec).toBe(10);
    expect(a1.endSec).toBe(50);
    expect(a1.durationSec).toBe(40);
    expect(a1.intensity).toBe(0);
    expect(a1.tempo).toBe(1);
    expect(a1.gainDb).toBe(-10);
    expect(a1.vector).toEqual({
      calma: 1,
      alegria: 0,
      tristeza: 0,
      suspenso: 0,
      misterio: 0,
      aventura: 0,
      combate: 0,
      asombro: 0,
    });
    const a2 = manifest.tracks[2]!;
    expect(a2.intensity).toBe(0.5);
    expect(a2.tempo).toBe(0.5);
    const good = manifest.tracks[3]!;
    expect(good.labelId).toBe("lab-good");
    expect(good.provisional).toBeUndefined();
    expect(good.startSec).toBeUndefined();
    expect(good.endSec).toBe(30);
    expect(good.durationSec).toBe(30);
    expect(good.intensity).toBe(1);
    expect(good.tempo).toBe(0);
    expect(good.gainDb).toBeUndefined();
    expect(good.vector.calma).toBe(0.256);
    expect(good.vector.aventura).toBe(1);
    expect(good.vector.tristeza).toBe(0.8);
    expect(warnings.join("\n")).toMatch("lab-old");
    expect(warnings.join("\n")).toMatch("lab-missing");
    expect(warnings.join("\n")).toMatch("lab-moved");
    expect(() => parseManifest(JSON.parse(JSON.stringify(manifest)))).not.toThrow();
  });

  it("keeps ND files whole with the longest segment labels", () => {
    const { manifest, warnings } = labelsToManifest(labels(), library());
    const nd = manifest.tracks[0]!;
    expect(nd.id).toBe("lab-nd");
    expect(nd.emotion).toBe("aventura");
    expect(nd.startSec).toBeUndefined();
    expect(nd.endSec).toBeUndefined();
    expect(nd.durationSec).toBe(200);
    expect(nd.gainDb).toBe(5);
    expect(nd.provisional).toBeUndefined();
    expect(warnings.join("\n")).toMatch("seg-c2");
  });

  it("drops todo tracks with --reviewed-only", () => {
    const { manifest, warnings } = labelsToManifest(labels(), library(), { reviewedOnly: true });
    expect(manifest.tracks.map((t) => t.id)).toEqual(["lab-nd", "lab-good", "chopin-1"]);
    expect(warnings.join("\n")).toMatch("lab-todo");
    expect(() => parseManifest(JSON.parse(JSON.stringify(manifest)))).not.toThrow();
  });

  it("rejects a non-2 labels export", () => {
    expect(() => labelsToManifest({ ...labels(), schemaVersion: 1 }, library())).toThrow(
      "schemaVersion",
    );
  });
});
