import { describe, expect, it } from "vitest";
import {
  candidatesFor,
  dominantEmotion,
  homeTracks,
  nextTrack,
  parseManifest,
  pickInitialSoundtrack,
  pickRandomTrack,
  requestStyleChange,
  resolveInitialSelection,
  soundtrackCoverage,
} from "./music";
import type { MusicManifest, MusicSelection, SceneSignal, Track } from "./music";
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
  soundtrack: string,
  style: string,
  intensity = 0.5,
  tempo = 0.5,
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

// Two orchestral soundtracks with overlapping emotions (orch-b has no
// tristeza), one piano soundtrack with some emotions, one electronic
// soundtrack that must never play while the style is orchestral.
const manifest: MusicManifest = {
  version: 3,
  styles: [
    { id: "orchestral", name: "Orquesta" },
    { id: "piano", name: "Piano" },
    { id: "electronic", name: "Electronica" },
  ],
  soundtracks: [
    { id: "orch-a", name: "A", style: "orchestral" },
    { id: "orch-b", name: "B", style: "orchestral" },
    { id: "piano-a", name: "P", style: "piano" },
    { id: "elec", name: "E", style: "electronic" },
  ],
  playlists: [],
  tracks: [
    track("a-calma", "calma", "orch-a", "orchestral"),
    track("a-calm2", "calma", "orch-a", "orchestral", 0.52),
    track("a-triste", "tristeza", "orch-a", "orchestral"),
    track("a-far", "calma", "orch-a", "orchestral", 0.9, 0.9),
    track("b-calma", "calma", "orch-b", "orchestral"),
    track("b-alegre", "alegria", "orch-b", "orchestral"),
    track("e-calma", "calma", "elec", "electronic"),
    track("p-calma", "calma", "piano-a", "piano"),
    track("p-mist", "misterio", "piano-a", "piano"),
  ],
};

const orchA: MusicSelection = { mode: "soundtrack", soundtrackId: "orch-a", style: "orchestral" };
const orchB: MusicSelection = { mode: "soundtrack", soundtrackId: "orch-b", style: "orchestral" };
const orchRandom: MusicSelection = { mode: "random", soundtrackId: "orch-a", style: "orchestral" };

function rngOf(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] as number;
}

describe("candidatesFor and homeTracks", () => {
  it("scopes every pick to the selection style", () => {
    const ids = candidatesFor(orchA, manifest).map((t) => t.id);
    expect(ids).not.toContain("e-calma");
    expect(ids).not.toContain("p-calma");
    expect(ids).toContain("a-calma");
  });

  it("a null style means the whole manifest", () => {
    expect(candidatesFor({ mode: "soundtrack", soundtrackId: null, style: null }, manifest)).toHaveLength(
      manifest.tracks.length,
    );
  });

  it("home is the session soundtrack, or the style set when none is set", () => {
    const styleTracks = candidatesFor(orchA, manifest);
    expect(homeTracks(orchA, styleTracks).map((t) => t.id).sort()).toEqual(
      ["a-calma", "a-calm2", "a-far", "a-triste"].sort(),
    );
    expect(
      homeTracks({ mode: "soundtrack", soundtrackId: "gone", style: "orchestral" }, styleTracks),
    ).toHaveLength(styleTracks.length);
  });
});

describe("pickInitialSoundtrack and coverage", () => {
  it("counts distinct hand-labeled emotions per soundtrack", () => {
    expect(soundtrackCoverage(manifest, "orch-a")).toBe(2);
    expect(soundtrackCoverage(manifest, "orch-b")).toBe(2);
    expect(soundtrackCoverage(manifest, "piano-a")).toBe(2);
  });

  it("breaks coverage ties by lower soundtrack id", () => {
    expect(pickInitialSoundtrack(manifest, null)).toBe("orch-a");
  });

  it("prefers wider coverage over a lower id", () => {
    const wide: MusicManifest = {
      ...manifest,
      soundtracks: [
        { id: "z-wide", name: "Z", style: "orchestral" },
        { id: "a-thin", name: "A", style: "orchestral" },
      ],
      tracks: [
        track("w1", "calma", "z-wide", "orchestral"),
        track("w2", "tristeza", "z-wide", "orchestral"),
        track("w3", "alegria", "z-wide", "orchestral"),
        track("t1", "calma", "a-thin", "orchestral"),
      ],
    };
    expect(pickInitialSoundtrack(wide, null)).toBe("z-wide");
  });

  it("a valid persisted id wins, an unknown one falls back", () => {
    expect(pickInitialSoundtrack(manifest, "piano-a")).toBe("piano-a");
    expect(pickInitialSoundtrack(manifest, "gone")).toBe("orch-a");
  });

  it("returns null when no soundtrack has tracks", () => {
    expect(pickInitialSoundtrack({ ...manifest, tracks: [] }, null)).toBeNull();
  });
});

describe("resolveInitialSelection", () => {
  it("defaults to the best-coverage soundtrack and its style", () => {
    expect(resolveInitialSelection(manifest, null)).toEqual({
      mode: "soundtrack",
      soundtrackId: "orch-a",
      style: "orchestral",
    });
  });

  it("a valid persisted choice wins", () => {
    expect(
      resolveInitialSelection(manifest, { mode: "random", soundtrackId: "piano-a", style: "piano" }),
    ).toEqual({ mode: "random", soundtrackId: "piano-a", style: "piano" });
  });

  it("ignores a stored style with no tracks but keeps a soundtrack in the resolved style", () => {
    expect(
      resolveInitialSelection(manifest, { mode: "soundtrack", soundtrackId: "orch-b", style: "koto" }),
    ).toEqual({ mode: "soundtrack", soundtrackId: "orch-b", style: "orchestral" });
  });

  it("ignores a stored soundtrack outside the stored style", () => {
    expect(
      resolveInitialSelection(manifest, { mode: "soundtrack", soundtrackId: "orch-b", style: "piano" }),
    ).toEqual({ mode: "soundtrack", soundtrackId: "piano-a", style: "piano" });
  });

  it("treats an unknown mode as soundtrack mode", () => {
    const prefs = { mode: "party", soundtrackId: "orch-a", style: "orchestral" } as unknown as {
      mode: "soundtrack";
      soundtrackId: string;
      style: string;
    };
    expect(resolveInitialSelection(manifest, prefs).mode).toBe("soundtrack");
  });
});

describe("nextTrack across soundtracks", () => {
  it("cycles inside the current soundtrack first, then wraps there", () => {
    const s = signal("calma");
    expect(nextTrack(s, manifest, "a-calma", undefined, orchA)?.id).toBe("a-calm2");
    expect(nextTrack(s, manifest, "a-calm2", undefined, orchA)?.id).toBe("a-far");
    expect(nextTrack(s, manifest, "a-far", undefined, orchA)?.id).toBe("a-calma");
  });

  it("leaves the soundtrack when it holds no other same-emotion track", () => {
    const s = signal("calma");
    const next = nextTrack(s, manifest, "b-calma", undefined, orchB);
    expect(next?.soundtrack).toBe("orch-a");
    expect(next?.id).toBe("a-calm2");
  });

  it("falls back to the best same-style track when the emotion is missing", () => {
    const s = signal("misterio");
    const next = nextTrack(s, manifest, "a-calma", undefined, orchA);
    expect(next?.style).toBe("orchestral");
    expect(next?.id).not.toBe("a-calma");
  });

  it("never leaves the style, even for the fallback", () => {
    const s = signal("calma");
    for (const id of ["a-calma", "b-calma", "a-triste", "b-alegre"]) {
      expect(nextTrack(s, manifest, id, undefined, orchA)?.style).toBe("orchestral");
    }
  });

  it("in random mode ranges over all same-style soundtracks at once", () => {
    const s = signal("calma");
    const next = nextTrack(s, manifest, "a-calma", undefined, orchRandom);
    expect(next?.id).toBe("b-calma");
    expect(next?.style).toBe("orchestral");
  });

  it("a null scene cycles the style set in id order", () => {
    expect(nextTrack(null, manifest, "a-triste", undefined, orchA)?.id).toBe("b-alegre");
    expect(nextTrack(null, manifest, null, undefined, orchA)?.id).toBe("a-calm2");
  });
});

describe("pickRandomTrack", () => {
  const cands = candidatesFor(orchA, manifest);

  it("draws only matching emotion and style within tolerance", () => {
    for (const seed of [0, 0.3, 0.6, 0.99]) {
      const pick = pickRandomTrack(cands, signal("calma"), null, rngOf([seed]));
      expect(pick?.emotion).toBe("calma");
      expect(pick?.style).toBe("orchestral");
      expect(pick?.id).not.toBe("a-far");
    }
  });

  it("is deterministic under a seeded rng", () => {
    const first = pickRandomTrack(cands, signal("calma"), null, rngOf([0.99]));
    const second = pickRandomTrack(cands, signal("calma"), null, rngOf([0.99]));
    expect(first?.id).toBe(second?.id);
  });

  it("keeps the current track when it is itself eligible", () => {
    const pick = pickRandomTrack(cands, signal("calma"), "a-calma", rngOf([0.99]));
    expect(pick?.id).toBe("a-calma");
  });

  it("skips the current track when it is not eligible", () => {
    const pick = pickRandomTrack(cands, signal("calma"), "a-far", rngOf([0]));
    expect(pick?.id).not.toBe("a-far");
    expect(pick?.emotion).toBe("calma");
  });

  it("uses the best same-style tracks when the emotion is missing", () => {
    const pick = pickRandomTrack(cands, signal("misterio"), null, rngOf([0]));
    expect(pick?.style).toBe("orchestral");
    expect(pick).not.toBeNull();
  });

  it("returns null for an empty set", () => {
    expect(pickRandomTrack([], signal("calma"), null, rngOf([0]))).toBeNull();
  });
});

describe("requestStyleChange", () => {
  it("lands in the new style with the coverage soundtrack", () => {
    const picked = requestStyleChange(manifest, "piano", signal("calma"));
    expect(picked?.track.style).toBe("piano");
    expect(picked?.track.id).toBe("p-calma");
    expect(picked?.soundtrackId).toBe("piano-a");
  });

  it("falls back to the best same-style track when the style lacks the emotion", () => {
    const picked = requestStyleChange(manifest, "piano", signal("tristeza"));
    expect(picked?.track.style).toBe("piano");
    expect(picked?.soundtrackId).toBe("piano-a");
  });

  it("returns null when the style has no tracks", () => {
    expect(requestStyleChange(manifest, "koto", signal("calma"))).toBeNull();
  });

  it("a null scene takes the first track in id order", () => {
    expect(requestStyleChange(manifest, "electronic", null)?.track.id).toBe("e-calma");
  });

  it("ranks inside the picked soundtrack first, not the style-wide best", () => {
    const two: MusicManifest = {
      ...manifest,
      soundtracks: [
        { id: "a-wide", name: "Wide", style: "orchestral" },
        { id: "b-narrow", name: "Narrow", style: "orchestral" },
      ],
      tracks: [
        track("a-c1", "calma", "a-wide", "orchestral", 0.9, 0.9),
        track("a-t1", "tristeza", "a-wide", "orchestral"),
        track("a-m1", "misterio", "a-wide", "orchestral"),
        track("b-c1", "calma", "b-narrow", "orchestral", 0.5, 0.5),
      ],
    };
    const picked = requestStyleChange(two, "orchestral", signal("calma"));
    expect(picked?.soundtrackId).toBe("a-wide");
    expect(picked?.track.soundtrack).toBe("a-wide");
  });
});

describe("dominantEmotion", () => {
  it("follows the renormalized argmax", () => {
    expect(dominantEmotion(signal("alegria"))).toBe("alegria");
  });
});

describe("parseManifest v3", () => {
  const styleList = [
    { id: "orchestral", name: "Orquesta" },
    { id: "piano", name: "Piano" },
  ];
  const soundtrackList = [
    { id: "a", name: "A", style: "orchestral" },
    { id: "b", name: "B", style: "piano" },
    { id: "empty", name: "Empty", style: "piano" },
  ];
  function entry(id: string, soundtrack = "a", style = "orchestral") {
    return {
      id,
      src: `/music/${id}.mp3`,
      title: id,
      emotion: "calma",
      vector: Object.fromEntries(EMOTIONS.map((e) => [e, 0.125])),
      intensity: 0.5,
      tempo: 0.5,
      durationSec: 60,
      soundtrack,
      style,
    };
  }
  function good() {
    return {
      version: 3,
      styles: styleList,
      soundtracks: soundtrackList,
      tracks: [entry("t1"), entry("t2", "b", "piano")],
    };
  }

  it("accepts a good manifest, including a soundtrack without tracks", () => {
    const parsed = parseManifest(JSON.parse(JSON.stringify(good())));
    expect(parsed.version).toBe(3);
    expect(parsed.tracks).toHaveLength(2);
  });

  it("rejects an unknown soundtrack id, naming the track", () => {
    const json = good();
    json.tracks[0] = entry("t1", "zzz");
    expect(() => parseManifest(json)).toThrow(/t1/);
  });

  it("rejects a track style that differs from its soundtrack style", () => {
    const json = good();
    json.tracks[0] = entry("t1", "a", "piano");
    expect(() => parseManifest(json)).toThrow(/t1/);
  });

  it("rejects a track style no style entry lists", () => {
    const json = good();
    json.tracks[0] = entry("t1", "a", "koto");
    expect(() => parseManifest(json)).toThrow(/t1/);
  });

  it("rejects duplicate track ids, soundtrack ids, and style ids", () => {
    const dupTracks = good();
    dupTracks.tracks.push(entry("t1"));
    expect(() => parseManifest(dupTracks)).toThrow(/t1/);
    const dupSound = good();
    dupSound.soundtracks.push({ id: "a", name: "Dup", style: "orchestral" });
    expect(() => parseManifest(dupSound)).toThrow(/a/);
    const dupStyles = good();
    dupStyles.styles.push({ id: "piano", name: "Dup" });
    expect(() => parseManifest(dupStyles)).toThrow(/piano/);
  });

  it("rejects a soundtrack whose style is not listed", () => {
    const json = good();
    json.soundtracks[0] = { id: "a", name: "A", style: "koto" };
    expect(() => parseManifest(json)).toThrow(/a/);
  });
});
