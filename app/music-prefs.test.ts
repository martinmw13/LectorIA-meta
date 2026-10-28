import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_VOLUME, loadMusicPrefs, saveMusicPrefs } from "./music-prefs";

function stubStorage(store: Record<string, string> = {}, throwing = false) {
  const storage = {
    getItem: (key: string) => {
      if (throwing) throw new Error("denied");
      return store[key] ?? null;
    },
    setItem: (key: string, value: string) => {
      if (throwing) throw new Error("denied");
      store[key] = value;
    },
  };
  vi.stubGlobal("window", { localStorage: storage });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("music prefs", () => {
  it("returns null with no stored choice and no window", () => {
    expect(loadMusicPrefs()).toBeNull();
  });

  it("round-trips style, playlist, volume, and muted", () => {
    const store = stubStorage();
    saveMusicPrefs({ style: "piano", volume: 0.4, muted: true, playlist: true });
    expect(loadMusicPrefs()).toEqual({ style: "piano", volume: 0.4, muted: true, playlist: true });
    expect(store["lectoria.music.v1"]).toContain("piano");
  });

  it("loads old style-only values with playlist, volume, and mute defaults", () => {
    const store = stubStorage();
    store["lectoria.music.v1"] = JSON.stringify({ style: "orchestral" });
    expect(loadMusicPrefs()).toEqual({
      style: "orchestral",
      volume: null,
      muted: false,
      playlist: false,
    });
  });

  it("loads old values by style alone and ignores unknown fields", () => {
    const store = stubStorage();
    store["lectoria.music.v1"] = JSON.stringify({
      mode: "random",
      soundtrackId: "orch-b",
      style: "orchestral",
      extra: true,
    });
    expect(loadMusicPrefs()).toEqual({
      style: "orchestral",
      volume: null,
      muted: false,
      playlist: false,
    });
  });

  it("falls back on bad json or bad values", () => {
    const store = stubStorage();
    store["lectoria.music.v1"] = "not json";
    expect(loadMusicPrefs()).toBeNull();
    store["lectoria.music.v1"] = JSON.stringify({ style: 7, volume: "loud", muted: 1 });
    expect(loadMusicPrefs()).toEqual({ style: null, volume: null, muted: false, playlist: false });
    store["lectoria.music.v1"] = JSON.stringify({ style: null, volume: NaN, muted: false });
    expect(loadMusicPrefs()).toEqual({ style: null, volume: null, muted: false, playlist: false });
    store["lectoria.music.v1"] = JSON.stringify({ style: null, volume: 2, muted: false });
    expect(loadMusicPrefs()).toEqual({ style: null, volume: null, muted: false, playlist: false });
    store["lectoria.music.v1"] = JSON.stringify({
      style: null,
      volume: null,
      muted: false,
      playlist: "yes",
    });
    expect(loadMusicPrefs()).toEqual({ style: null, volume: null, muted: false, playlist: false });
  });

  it("survives storage exceptions on load and save", () => {
    stubStorage({}, true);
    expect(loadMusicPrefs()).toBeNull();
    expect(() =>
      saveMusicPrefs({ style: null, volume: null, muted: false, playlist: false }),
    ).not.toThrow();
  });

  it("defaults the player volume when nothing is stored", () => {
    expect(DEFAULT_VOLUME).toBe(0.8);
  });
});
