import { describe, expect, it } from "vitest";
import { nextTrack } from "./music";
import type { MusicManifest, MusicSelection, SceneSignal, SelectEnv, Track } from "./music";
import type { Vector8 } from "./types";
import { EMOTIONS } from "./types";
import {
  initScheduler,
  noteTrackEnded,
  observeScene,
  requestNext,
  switchStyle,
  tickScheduler,
} from "./music-schedule";

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
    loop: true,
    soundtrack,
    style,
  };
}

const manifest: MusicManifest = {
  version: 3,
  styles: [
    { id: "orchestral", name: "Orquesta" },
    { id: "piano", name: "Piano" },
  ],
  soundtracks: [
    { id: "orch-a", name: "A", style: "orchestral" },
    { id: "orch-b", name: "B", style: "orchestral" },
    { id: "piano-a", name: "P", style: "piano" },
  ],
  playlists: [],
  tracks: [
    track("a-calma", "calma", "orch-a", "orchestral"),
    track("a-calm2", "calma", "orch-a", "orchestral", 0.52),
    track("a-triste", "tristeza", "orch-a", "orchestral"),
    track("a-far", "calma", "orch-a", "orchestral", 0.9, 0.9),
    track("b-calma", "calma", "orch-b", "orchestral"),
    track("b-alegre", "alegria", "orch-b", "orchestral"),
    track("p-calma", "calma", "piano-a", "piano"),
    track("p-mist", "misterio", "piano-a", "piano"),
  ],
};

function envFor(selection: MusicSelection, rng: () => number = () => 0): SelectEnv {
  return { selection, rng };
}

const orchA = envFor({ mode: "soundtrack", soundtrackId: "orch-a", style: "orchestral" });
const orchB = envFor({ mode: "soundtrack", soundtrackId: "orch-b", style: "orchestral" });
const orchRandom = (rng: () => number = () => 0) =>
  envFor({ mode: "random", soundtrackId: "orch-a", style: "orchestral" }, rng);

describe("soundtrack mode", () => {
  it("stays inside the soundtrack across scenes with different emotions", () => {
    let d = observeScene(initScheduler(), "s1", signal("calma"), manifest, 0, orchA);
    expect(d.switchToId).toBe("a-calma");
    d = observeScene(d.state, "s2", signal("tristeza"), manifest, 50, orchA);
    const settled = tickScheduler(d.state, signal("tristeza"), manifest, 71, orchA);
    expect(settled.state.activeSceneId).toBe("s2");
    expect(settled.switchToId).toBe("a-triste");
    expect(settled.fallback).toBe(false);
  });

  it("borrows the best same-style track when the soundtrack lacks the emotion", () => {
    let d = observeScene(initScheduler(), "s1", signal("calma"), manifest, 0, orchB);
    expect(d.switchToId).toBe("b-calma");
    d = observeScene(d.state, "s2", signal("tristeza"), manifest, 50, orchB);
    const settled = tickScheduler(d.state, signal("tristeza"), manifest, 71, orchB);
    expect(settled.switchToId).toBe("a-triste");
    expect(settled.fallback).toBe(true);
  });

  it("returns inside with no fallback flag once the emotion is back", () => {
    let d = observeScene(initScheduler(), "s1", signal("calma"), manifest, 0, orchB);
    d = observeScene(d.state, "s2", signal("tristeza"), manifest, 50, orchB);
    d = tickScheduler(d.state, signal("tristeza"), manifest, 71, orchB);
    expect(d.fallback).toBe(true);
    d = observeScene(d.state, "s3", signal("alegria"), manifest, 100, orchB);
    const settled = tickScheduler(d.state, signal("alegria"), manifest, 121, orchB);
    expect(settled.switchToId).toBe("b-alegre");
    expect(settled.fallback).toBe(false);
  });
});

describe("random mode", () => {
  function playing(id: string, started: number) {
    return {
      ...initScheduler(),
      currentId: id,
      currentStartedSec: started,
      activeSceneId: "s1",
    };
  }

  it("keeps the current track when it is itself eligible", () => {
    const d = tickScheduler(playing("a-calma", 0), signal("calma"), manifest, 100, orchRandom());
    expect(d.switchToId).toBeNull();
  });

  it("draws another eligible track once min-track time has passed", () => {
    const d = tickScheduler(playing("a-far", 0), signal("calma"), manifest, 100, orchRandom());
    expect(d.switchToId).toBe("a-calma");
    expect(d.crossfadeSec).toBe(3);
    expect(d.hardCut).toBe(false);
    expect(d.fallback).toBe(false);
  });

  it("holds the current pick until min-track time passes", () => {
    const d = tickScheduler(playing("a-far", 0), signal("calma"), manifest, 10, orchRandom());
    expect(d.switchToId).toBeNull();
  });

  it("is deterministic under a seeded rng", () => {
    const run = () =>
      tickScheduler(playing("a-far", 0), signal("calma"), manifest, 100, orchRandom(() => 0.99));
    expect(run().switchToId).toBe(run().switchToId);
    expect(run().switchToId).not.toBe("a-far");
  });

  it("never leaves the style", () => {
    let d = observeScene(initScheduler(), "s1", signal("calma"), manifest, 0, orchRandom());
    for (const [scene, top, at] of [
      ["s2", "tristeza", 30],
      ["s3", "alegria", 80],
      ["s4", "misterio", 130],
    ] as const) {
      d = observeScene(d.state, scene, signal(top), manifest, at, orchRandom());
      d = tickScheduler(d.state, signal(top), manifest, at + 21, orchRandom());
      if (d.switchToId !== null) {
        const picked = manifest.tracks.find((t) => t.id === d.switchToId);
        expect(picked?.style).toBe("orchestral");
      }
    }
  });
});

describe("requestNext fallback flag", () => {
  it("a Next that leaves the soundtrack reports fallback", () => {
    let d = observeScene(initScheduler(), "s1", signal("calma"), manifest, 0, orchB);
    d = requestNext(d.state, signal("calma"), manifest, 5, orchB);
    expect(d.switchToId).not.toBe("b-calma");
    expect(d.fallback).toBe(true);
  });

  it("a Next that stays inside reports no fallback", () => {
    let d = observeScene(initScheduler(), "s1", signal("calma"), manifest, 0, orchA);
    d = requestNext(d.state, signal("calma"), manifest, 5, orchA);
    expect(d.switchToId).toBe("a-calm2");
    expect(d.fallback).toBe(false);
  });

  it("Next offers nothing outside the style", () => {
    expect(nextTrack(signal("calma"), manifest, "p-calma", undefined, orchA.selection)?.style).toBe(
      "orchestral",
    );
  });
});

describe("noteTrackEnded", () => {
  it("never crosses styles and flags an out-of-soundtrack pick", () => {
    let d = observeScene(initScheduler(), "s1", signal("calma"), manifest, 0, orchB);
    d = noteTrackEnded(d.state, signal("calma"), manifest, d.switchToId as string, 200, orchB);
    const picked = manifest.tracks.find((t) => t.id === d.switchToId);
    expect(picked?.style).toBe("orchestral");
  });
});

describe("switchStyle", () => {
  it("switches at once with the normal crossfade and sets the override", () => {
    let d = observeScene(initScheduler(), "s1", signal("calma"), manifest, 0, orchA);
    expect(d.switchToId).toBe("a-calma");
    const changed = switchStyle(d.state, signal("calma"), manifest, 1, "piano");
    expect(changed.switchToId).toBe("p-calma");
    expect(changed.soundtrackId).toBe("piano-a");
    expect(changed.crossfadeSec).toBe(3);
    expect(changed.hardCut).toBe(false);
    expect(changed.state.overrideId).toBe("p-calma");
    expect(changed.fallback).toBe(false);
  });

  it("later scenes stay in the new style", () => {
    let d = observeScene(initScheduler(), "s1", signal("calma"), manifest, 0, orchA);
    d = switchStyle(d.state, signal("calma"), manifest, 1, "piano");
    const piano = envFor({ mode: "soundtrack", soundtrackId: "piano-a", style: "piano" });
    const next = observeScene(d.state, "s2", signal("misterio"), manifest, 50, piano);
    const settled = tickScheduler(next.state, signal("misterio"), manifest, 71, piano);
    expect(settled.switchToId).toBe("p-mist");
  });

  it("returns null with the state unchanged when the style has no tracks", () => {
    const d = observeScene(initScheduler(), "s1", signal("calma"), manifest, 0, orchA);
    const changed = switchStyle(d.state, signal("calma"), manifest, 50, "koto");
    expect(changed.switchToId).toBeNull();
    expect(changed.soundtrackId).toBeNull();
  });
});
