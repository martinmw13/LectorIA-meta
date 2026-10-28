import { describe, expect, it } from "vitest";
import {
  bhattacharyyaSimilarity,
  cosineSimilarity,
  dominantEmotion,
  nextTrack,
  normalize8,
  parseManifest,
  rankTracks,
  scoreTrack,
} from "./music";
import type { MusicManifest, SceneSignal, Track } from "./music";
import type { Vector8 } from "./types";
import { EMOTIONS } from "./types";

function vec(top: string): Vector8 {
  const v = Object.fromEntries(EMOTIONS.map((id) => [id, 0.01])) as Record<string, number>;
  v[top] = 0.93;
  return v as Vector8;
}

function signal(top: string, intensity = 0.5, tempo = 0.5): SceneSignal {
  return { vector: vec(top), intensity, tempo };
}

function track(
  id: string,
  top: string,
  intensity = 0.5,
  tempo = 0.5,
  soundtrack = "snd",
  style = "orchestral",
): Track {
  return {
    id,
    src: `/music/${id}.mp3`,
    title: id,
    emotion: top as Track["emotion"],
    vector: vec(top),
    intensity,
    tempo,
    durationSec: 120,
    startSec: 0,
    gainDb: 0,
    loop: true,
    soundtrack,
    style,
  };
}

// Three tristeza tracks (ranked a > b > c by intensity closeness),
// one calma and one suspenso.
const manifest: MusicManifest = {
  version: 3,
  styles: [{ id: "orchestral", name: "Orquesta" }],
  soundtracks: [{ id: "snd", name: "Snd", style: "orchestral" }],
  playlists: [],
  tracks: [
    track("sad-a", "tristeza", 0.5, 0.5),
    track("sad-b", "tristeza", 0.6, 0.5),
    track("sad-c", "tristeza", 0.9, 0.9),
    track("calm", "calma", 0.2, 0.2),
    track("tense", "suspenso", 0.6, 0.6),
  ],
};

describe("bhattacharyyaSimilarity", () => {
  it("gives 1 for identical vectors with equal intensity and tempo", () => {
    const s = signal("tristeza");
    expect(bhattacharyyaSimilarity(s, track("x", "tristeza"))).toBeCloseTo(1, 10);
  });

  it("renormalizes: proportional vectors score the same", () => {
    const base = signal("calma");
    const half: SceneSignal = {
      vector: Object.fromEntries(EMOTIONS.map((id) => [id, base.vector[id] / 2])) as Vector8,
      intensity: 0.5,
      tempo: 0.5,
    };
    const a = track("a", "calma");
    expect(bhattacharyyaSimilarity(half, a)).toBeCloseTo(bhattacharyyaSimilarity(base, a), 10);
  });

  it("ignores extra keys such as an unknown entry", () => {
    const s = signal("calma");
    const withUnknown = { ...s.vector, unknown: 0.9 } as unknown as Vector8;
    expect(normalize8(withUnknown)).toEqual(normalize8(s.vector));
  });

  it("scores an all-zero vector as no affinity plus intensity and tempo terms", () => {
    const zero = Object.fromEntries(EMOTIONS.map((id) => [id, 0])) as unknown as Vector8;
    const s: SceneSignal = { vector: zero, intensity: 0.5, tempo: 0.5 };
    expect(bhattacharyyaSimilarity(s, track("a", "calma"))).toBeCloseTo(0.15 + 0.15, 10);
  });
});

describe("scoreTrack and rankTracks", () => {
  it("uses bhattacharyya by default", () => {
    const s = signal("tristeza");
    const t = manifest.tracks[0] as Track;
    expect(scoreTrack(s, t)).toBe(bhattacharyyaSimilarity(s, t));
  });

  it("accepts the cosine alternative through config", () => {
    const s = signal("tristeza");
    const ranked = rankTracks(s, manifest, { similarity: cosineSimilarity });
    const manual = [...manifest.tracks].sort(
      (a, b) => cosineSimilarity(s, b) - cosineSimilarity(s, a),
    );
    expect(ranked.map((t) => t.id)).toEqual(manual.map((t) => t.id));
  });

  it("ranks by the override weights when provided", () => {
    const s = signal("tristeza");
    const two: MusicManifest = {
      version: 3,
      styles: [{ id: "orchestral", name: "Orquesta" }],
      soundtracks: [{ id: "snd", name: "Snd", style: "orchestral" }],
      playlists: [],
      tracks: [
        track("sad-far", "tristeza", 0.9, 0.9),
        track("calm-near", "calma", 0.5, 0.5),
      ],
    };
    expect(rankTracks(s, two)[0]?.id).toBe("sad-far");
    const custom = { emotion: 0, intensity: 0.5, tempo: 0.5 };
    const ranked = rankTracks(s, two, { weights: custom });
    expect(ranked[0]?.id).toBe("calm-near");
    expect(scoreTrack(s, two.tracks[0] as Track, { weights: custom })).toBe(
      bhattacharyyaSimilarity(s, two.tracks[0] as Track, custom),
    );
  });

  it("breaks ties by lower track id, not manifest order", () => {
    const tied: MusicManifest = {
      version: 3,
      styles: [{ id: "orchestral", name: "Orquesta" }],
      soundtracks: [{ id: "snd", name: "Snd", style: "orchestral" }],
      playlists: [],
      tracks: [track("b", "calma"), track("a", "calma")],
    };
    expect(rankTracks(signal("calma"), tied)[0]?.id).toBe("a");
  });

  it("dominantEmotion follows the renormalized argmax with EMOTIONS order ties", () => {
    expect(dominantEmotion(signal("suspenso"))).toBe("suspenso");
    const tied = Object.fromEntries(EMOTIONS.map((id) => [id, 0.125])) as unknown as Vector8;
    expect(dominantEmotion({ vector: tied, intensity: 0, tempo: 0 })).toBe("calma");
  });
});

describe("nextTrack", () => {
  it("cycles same-emotion tracks in score order, wrapping and skipping current", () => {
    const s = signal("tristeza");
    expect(nextTrack(s, manifest, "sad-a")?.id).toBe("sad-b");
    expect(nextTrack(s, manifest, "sad-b")?.id).toBe("sad-c");
    expect(nextTrack(s, manifest, "sad-c")?.id).toBe("sad-a");
  });

  it("starts at the top candidate when current has another emotion", () => {
    expect(nextTrack(signal("tristeza"), manifest, "calm")?.id).toBe("sad-a");
    expect(nextTrack(signal("tristeza"), manifest, null)?.id).toBe("sad-a");
  });

  it("falls back to best overall when no other same-emotion track exists", () => {
    const s = signal("calma");
    const next = nextTrack(s, manifest, "calm");
    const expected = rankTracks(s, manifest).find((t) => t.id !== "calm");
    expect(next?.id).toBe(expected?.id);
    expect(next?.id).not.toBe("calm");
  });

  it("falls back when the dominant emotion has no tracks", () => {
    const s = signal("aventura");
    const next = nextTrack(s, manifest, "sad-a");
    expect(next?.id).toBe(rankTracks(s, manifest).find((t) => t.id !== "sad-a")?.id);
  });

  it("cycles all tracks in id order for a null scene", () => {
    expect(nextTrack(null, manifest, "sad-b")?.id).toBe("sad-c");
    expect(nextTrack(null, manifest, "tense")?.id).toBe("calm");
    expect(nextTrack(null, manifest, null)?.id).toBe("calm");
  });

  it("returns null with one track or none", () => {
    const one: MusicManifest = {
      version: 3,
      styles: [{ id: "orchestral", name: "Orquesta" }],
      soundtracks: [{ id: "snd", name: "Snd", style: "orchestral" }],
      playlists: [],
      tracks: [track("solo", "calma")],
    };
    expect(nextTrack(signal("calma"), one, "solo")).toBeNull();
    const empty: MusicManifest = {
      version: 3,
      styles: [{ id: "orchestral", name: "Orquesta" }],
      soundtracks: [{ id: "snd", name: "Snd", style: "orchestral" }],
      playlists: [],
      tracks: [],
    };
    expect(nextTrack(signal("calma"), empty, null)).toBeNull();
  });
});

describe("parseManifest v2", () => {
  const good = {
    version: 2,
    tracks: [
      {
        id: "t1",
        src: "/music/t1.mp3",
        title: "One",
        emotion: "calma",
        vector: Object.fromEntries(EMOTIONS.map((id) => [id, 0.125])),
        intensity: 0.2,
        tempo: 0.3,
        durationSec: 120,
      },
    ],
  };

  it("migrates a good manifest to v3 with loop and startSec defaults", () => {
    const parsed = parseManifest(JSON.parse(JSON.stringify(good)));
    expect(parsed.version).toBe(3);
    expect(parsed.soundtracks).toEqual([{ id: "default", name: "Default", style: "orchestral" }]);
    expect(parsed.styles).toEqual([{ id: "orchestral", name: "Orchestra" }]);
    expect(parsed.tracks[0]?.soundtrack).toBe("default");
    expect(parsed.tracks[0]?.style).toBe("orchestral");
    expect(parsed.tracks[0]?.loop).toBe(true);
    expect(parsed.tracks[0]?.startSec).toBe(0);
  });

  it("rejects bad shapes", () => {
    expect(() => parseManifest(null)).toThrow();
    expect(() => parseManifest({ version: 1, tracks: [] })).toThrow();
    expect(() => parseManifest({ version: 2 })).toThrow();
    const bad = (mutate: (t: Record<string, unknown>) => void) => {
      const copy = JSON.parse(JSON.stringify(good)) as {
        tracks: Record<string, unknown>[];
      };
      mutate(copy.tracks[0] as Record<string, unknown>);
      return () => parseManifest(copy);
    };
    expect(bad((t) => { t.emotion = "unknown"; })).toThrow();
    expect(bad((t) => { t.title = 7; })).toThrow();
    expect(bad((t) => { (t.vector as Record<string, number>).calma = NaN; })).toThrow();
    expect(bad((t) => { t.intensity = 2; })).toThrow();
    expect(bad((t) => { t.durationSec = 0; })).toThrow();
    expect(bad((t) => { t.startSec = -1; })).toThrow();
    expect(bad((t) => { t.endSec = 5; t.startSec = 120; })).toThrow();
    expect(bad((t) => { t.loop = "yes"; })).toThrow();
    expect(bad((t) => { t.source = "remix"; })).toThrow();
    expect(bad((t) => { t.license = ""; })).toThrow();
    expect(bad((t) => { t.sourceUrl = "http://x/y.mp3"; })).toThrow();
    expect(bad((t) => { t.src = "http://x/y.mp3"; })).toThrow();
  });

  it("accepts optional fields", () => {
    const copy = JSON.parse(JSON.stringify(good)) as {
      tracks: Record<string, unknown>[];
    };
    Object.assign(copy.tracks[0] as object, {
      startSec: 5,
      loop: false,
      source: "recording",
      artist: "A",
      composer: "C",
      license: "CC0-1.0",
      attribution: "Played by A.",
      sourceUrl: "https://example.com/t1",
    });
    const parsed = parseManifest(copy);
    expect(parsed.tracks[0]?.startSec).toBe(5);
    expect(parsed.tracks[0]?.loop).toBe(false);
    expect(parsed.tracks[0]?.sourceUrl).toBe("https://example.com/t1");
  });
});
