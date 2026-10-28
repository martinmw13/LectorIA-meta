import { describe, expect, it } from "vitest";
import { CHOPIN_PLAYLIST_ID } from "./music";
import type { MusicManifest, Track } from "./music";
import type { Vector8 } from "./types";
import { EMOTIONS } from "./types";
import { currentMode, musicModes, nextMode } from "./music-modes";

function vec(): Vector8 {
  return Object.fromEntries(EMOTIONS.map((id) => [id, 0.125])) as Vector8;
}

function track(id: string, style: string, only = false): Track {
  return {
    id,
    src: `/music/${id}.mp3`,
    title: id,
    playlistOnly: only,
    emotion: "calma",
    vector: vec(),
    intensity: 0.5,
    tempo: 0.5,
    durationSec: 120,
    startSec: 0,
    gainDb: 0,
    loop: true,
    soundtrack: "s",
    style,
  };
}

const manifest: MusicManifest = {
  version: 3,
  styles: [
    { id: "orchestral", name: "Orquesta" },
    { id: "piano", name: "Piano" },
    { id: "koto", name: "Koto" },
  ],
  soundtracks: [{ id: "s", name: "S", style: "orchestral" }],
  playlists: [{ id: CHOPIN_PLAYLIST_ID, label: "Just play Chopin", trackIds: ["chop-1"] }],
  tracks: [
    track("o-1", "orchestral"),
    track("p-1", "piano"),
    track("chop-1", "orchestral", true),
  ],
};

describe("musicModes", () => {
  it("lists styles in manifest order, then the Chopin mode", () => {
    expect(musicModes(manifest)).toEqual([
      { id: "orchestral", kind: "style", label: "Orquesta" },
      { id: "piano", kind: "style", label: "Piano" },
      { id: CHOPIN_PLAYLIST_ID, kind: "playlist", label: "Just play Chopin" },
    ]);
  });

  it("excludes styles without tracks", () => {
    expect(musicModes(manifest).map((m) => m.id)).not.toContain("koto");
  });

  it("falls back to two styles with no playlist or empty trackIds", () => {
    const none = { ...manifest, playlists: [] };
    expect(musicModes(none).map((m) => m.id)).toEqual(["orchestral", "piano"]);
    const empty = {
      ...manifest,
      playlists: [{ id: CHOPIN_PLAYLIST_ID, label: "Just play Chopin", trackIds: [] }],
    };
    expect(musicModes(empty).map((m) => m.id)).toEqual(["orchestral", "piano"]);
  });
});

describe("currentMode and nextMode", () => {
  const modes = musicModes(manifest);

  it("cycles three states and wraps", () => {
    expect(nextMode(modes, currentMode({ style: "orchestral", playlistOn: false }))).toBe("piano");
    expect(nextMode(modes, currentMode({ style: "piano", playlistOn: false }))).toBe(
      CHOPIN_PLAYLIST_ID,
    );
    expect(nextMode(modes, currentMode({ style: "piano", playlistOn: true }))).toBe("orchestral");
  });

  it("starts at the first for a null or unknown current", () => {
    expect(nextMode(modes, currentMode({ style: null, playlistOn: false }))).toBe("orchestral");
    expect(nextMode(modes, "koto")).toBe("orchestral");
  });

  it("a single mode returns itself", () => {
    const solo = musicModes({ ...manifest, styles: [{ id: "piano", name: "Piano" }], playlists: [] });
    expect(nextMode(solo, "piano")).toBe("piano");
    expect(nextMode(solo, null)).toBe("piano");
  });

  it("no modes gives null", () => {
    expect(nextMode([], "orchestral")).toBeNull();
  });
});
