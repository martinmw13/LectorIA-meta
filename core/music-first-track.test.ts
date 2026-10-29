import { describe, expect, it } from "vitest";
import { CHOPIN_PLAYLIST_ID } from "./music";
import type { MusicManifest, SceneSignal, SelectEnv, Track } from "./music";
import type { Vector8 } from "./types";
import { EMOTIONS } from "./types";
import {
  enterPlaylist,
  initScheduler,
  noteTrackEnded,
  observeScene,
} from "./music-schedule";
import { dispatch, startSession } from "./music-session";
import type { SessionContext } from "./music-session";

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
  style: string,
  only = false,
  intensity = 0.5,
  tempo = 0.5,
): Track {
  return {
    id,
    src: `/music/${id}.mp3`,
    title: id,
    playlistOnly: only,
    emotion: top as Track["emotion"],
    vector: vec(top),
    intensity,
    tempo,
    durationSec: 120,
    startSec: 0,
    gainDb: 0,
    loop: true,
    soundtrack: "snd",
    style,
  };
}

const manifest: MusicManifest = {
  version: 3,
  styles: [{ id: "orchestral", name: "Orquesta" }],
  soundtracks: [{ id: "snd", name: "Snd", style: "orchestral" }],
  playlists: [
    { id: CHOPIN_PLAYLIST_ID, label: "Just play Chopin", trackIds: ["chop-1", "chop-2", "chop-3", "chop-4"] },
  ],
  tracks: [
    track("c1", "calma", "orchestral"),
    track("c2", "calma", "orchestral", false, 0.52),
    track("c3", "calma", "orchestral", false, 0.9, 0.9),
    track("sad", "tristeza", "orchestral"),
    track("chop-1", "calma", "orchestral", true),
    track("chop-2", "calma", "orchestral", true),
    track("chop-3", "calma", "orchestral", true),
    track("chop-4", "calma", "orchestral", true),
  ],
};

const orch: SelectEnv = { selection: { style: "orchestral" }, rng: () => 0 };

function firstPick(rng: () => number, excludeTrackId?: string | null) {
  return observeScene(initScheduler(), "s1", signal("calma"), manifest, 0, {
    ...orch,
    rng,
    excludeTrackId,
  });
}

function ctx(route: string | null, nowSec: number, over?: Partial<SessionContext>): SessionContext {
  return {
    manifest,
    signalOf: () => signal("calma"),
    routeSceneId: route,
    nowSec,
    rng: () => 0,
    ...over,
  };
}

describe("first track in style mode", () => {
  it("draws from the whole same-emotion pool, so rng 0 and 0.99 differ", () => {
    const lo = firstPick(() => 0);
    const hi = firstPick(() => 0.99);
    expect(lo.switchToId).not.toBeNull();
    expect(hi.switchToId).not.toBeNull();
    expect(hi.switchToId).not.toBe(lo.switchToId);
  });

  it("stays within the style and the dominant emotion", () => {
    for (const rng of [() => 0, () => 0.34, () => 0.67, () => 0.99]) {
      const id = firstPick(rng).switchToId as string;
      const picked = manifest.tracks.find((t) => t.id === id);
      expect(picked?.style).toBe("orchestral");
      expect(picked?.emotion).toBe("calma");
    }
  });

  it("falls back to the whole style set when no track matches the emotion", () => {
    const run = (rng: () => number) =>
      observeScene(initScheduler(), "s1", signal("misterio"), manifest, 0, { ...orch, rng });
    const lo = run(() => 0).switchToId as string;
    const hi = run(() => 0.99).switchToId as string;
    expect(lo).not.toBe(hi);
    for (const id of [lo, hi]) {
      expect(manifest.tracks.find((t) => t.id === id)?.style).toBe("orchestral");
    }
  });

  it("excludes the last-played track when another candidate exists", () => {
    expect(firstPick(() => 0, "c1").switchToId).toBe("c2");
    expect(firstPick(() => 0, "c3").switchToId).toBe("c1");
  });

  it("still picks the only candidate when it is the excluded one", () => {
    const solo: MusicManifest = {
      ...manifest,
      tracks: [track("only", "calma", "orchestral")],
    };
    const d = observeScene(initScheduler(), "s1", signal("calma"), solo, 0, {
      ...orch,
      excludeTrackId: "only",
    });
    expect(d.switchToId).toBe("only");
  });

  it("applies the exclusion through the session context", () => {
    const session = dispatch(
      startSession(manifest, null),
      { type: "sceneEntered", sceneId: "s1" },
      ctx("s1", 0, { excludeTrackId: "c1" }),
    );
    expect(session.view.currentId).toBe("c2");
  });
});

describe("first track in Chopin playlist mode", () => {
  it("starts at a random index, then advances in order and wraps", () => {
    const state = enterPlaylist(initScheduler(), manifest, CHOPIN_PLAYLIST_ID, 0, undefined, () => 0.5).state;
    expect(state.currentId).toBe("chop-3");
    expect(state.playlist).toEqual({ id: CHOPIN_PLAYLIST_ID, index: 2 });
    const second = noteTrackEnded(state, signal("calma"), manifest, "chop-3", 10, orch);
    expect(second.switchToId).toBe("chop-4");
    const wrapped = noteTrackEnded(second.state, signal("calma"), manifest, "chop-4", 20, orch);
    expect(wrapped.switchToId).toBe("chop-1");
  });

  it("a zero rng keeps the deterministic first-track entry", () => {
    const d = enterPlaylist(initScheduler(), manifest, CHOPIN_PLAYLIST_ID, 0);
    expect(d.switchToId).toBe("chop-1");
    expect(d.state.playlist).toEqual({ id: CHOPIN_PLAYLIST_ID, index: 0 });
  });

  it("excludes the last-played track when another playlist track exists", () => {
    const d = enterPlaylist(
      initScheduler(),
      manifest,
      CHOPIN_PLAYLIST_ID,
      0,
      undefined,
      () => 0,
      "chop-1",
    );
    expect(d.switchToId).toBe("chop-2");
  });

  it("a restored Chopin mode at startSession also starts at a random index", () => {
    const session = startSession(
      manifest,
      { style: "orchestral", volume: null, muted: false, playlist: true },
      () => 0.5,
    );
    expect(session.view.playlistOn).toBe(true);
    expect(session.view.currentId).toBe("chop-3");
    expect(session.view.fadeSec).toBe(0);
  });

  it("a restored Chopin mode skips the last-played track", () => {
    const session = startSession(
      manifest,
      { style: "orchestral", volume: null, muted: false, playlist: true, lastTrackId: "chop-3" },
      () => 0.5,
    );
    expect(session.view.currentId).toBe("chop-2");
  });
});
