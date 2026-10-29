import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_VOLUME,
  MUSIC_PREFS_KEY,
  createMusicPrefsStore,
  loadMusicPrefs,
} from "./music-prefs";

function fakeStorage(initial: Record<string, string> = {}, throwing = false) {
  const store: Record<string, string> = { ...initial };
  return {
    store,
    storage: {
      getItem: (key: string) => {
        if (throwing) throw new Error("denied");
        return store[key] ?? null;
      },
      setItem: (key: string, value: string) => {
        if (throwing) throw new Error("denied");
        store[key] = value;
      },
    },
  };
}

function stubWindow(store: Record<string, string>) {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    },
  });
}

describe("music prefs store", () => {
  it("volume and mute updates keep the stored style and Chopin mode", () => {
    const { storage, store } = fakeStorage({
      [MUSIC_PREFS_KEY]: JSON.stringify({
        style: "piano",
        playlist: true,
        volume: 0.5,
        muted: false,
      }),
    });
    const prefs = createMusicPrefsStore(storage);
    prefs.load();
    prefs.update({ volume: 0.3 });
    const merged = prefs.update({ muted: true });
    expect(merged).toEqual({ style: "piano", playlist: true, volume: 0.3, muted: true });
    expect(JSON.parse(store[MUSIC_PREFS_KEY] ?? "")).toEqual(merged);
  });

  it("update before load still preserves stored fields", () => {
    const { storage } = fakeStorage({
      [MUSIC_PREFS_KEY]: JSON.stringify({
        style: "piano",
        playlist: true,
        volume: 0.5,
        muted: false,
      }),
    });
    const prefs = createMusicPrefsStore(storage);
    expect(prefs.update({ volume: 0.3 })).toEqual({
      style: "piano",
      playlist: true,
      volume: 0.3,
      muted: false,
    });
  });

  it("empty storage plus a partial update falls back to defaults", () => {
    const { storage } = fakeStorage();
    const prefs = createMusicPrefsStore(storage);
    expect(prefs.load()).toBeNull();
    expect(prefs.update({ volume: 0.3 })).toEqual({
      style: null,
      volume: 0.3,
      muted: false,
      playlist: false,
    });
  });

  it("bad stored json falls back to defaults", () => {
    const { storage } = fakeStorage({ [MUSIC_PREFS_KEY]: "not json" });
    const prefs = createMusicPrefsStore(storage);
    expect(prefs.load()).toBeNull();
    expect(prefs.update({ muted: true })).toEqual({
      style: null,
      volume: DEFAULT_VOLUME,
      muted: true,
      playlist: false,
    });
  });

  it("throwing storage never throws and still merges in memory", () => {
    const { storage } = fakeStorage(
      {
        [MUSIC_PREFS_KEY]: JSON.stringify({
          style: "piano",
          playlist: true,
          volume: 0.5,
          muted: false,
        }),
      },
      true,
    );
    const prefs = createMusicPrefsStore(storage);
    expect(prefs.load()).toBeNull();
    expect(prefs.update({ volume: 0.3 })).toEqual({
      style: null,
      volume: 0.3,
      muted: false,
      playlist: false,
    });
    expect(prefs.update({ muted: true })).toEqual({
      style: null,
      volume: 0.3,
      muted: true,
      playlist: false,
    });
  });

  it("an old value without playlist loads false and round-trips", () => {
    const { storage, store } = fakeStorage({
      [MUSIC_PREFS_KEY]: JSON.stringify({ style: "orchestral" }),
    });
    const prefs = createMusicPrefsStore(storage);
    expect(prefs.load()).toEqual({
      style: "orchestral",
      volume: null,
      muted: false,
      playlist: false,
    });
    prefs.update({ volume: 0.4 });
    const fresh = createMusicPrefsStore(storage);
    expect(fresh.load()).toEqual({
      style: "orchestral",
      volume: 0.4,
      muted: false,
      playlist: false,
    });
    expect(store[MUSIC_PREFS_KEY]).toContain("orchestral");
  });

  it("loadMusicPrefs keeps its behaviour: null with no window, window values otherwise", () => {
    expect(loadMusicPrefs()).toBeNull();
    const store: Record<string, string> = {
      [MUSIC_PREFS_KEY]: JSON.stringify({
        style: "piano",
        volume: 0.4,
        muted: true,
        playlist: true,
      }),
    };
    stubWindow(store);
    try {
      expect(loadMusicPrefs()).toEqual({
        style: "piano",
        volume: 0.4,
        muted: true,
        playlist: true,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("defaults the player volume when nothing is stored", () => {
    expect(DEFAULT_VOLUME).toBe(0.8);
  });
});

describe("lastTrackId", () => {
  it("round-trips the last played track", () => {
    const { storage } = fakeStorage();
    const prefs = createMusicPrefsStore(storage);
    prefs.load();
    expect(prefs.update({ lastTrackId: "c2" })).toEqual({
      style: null,
      volume: DEFAULT_VOLUME,
      muted: false,
      playlist: false,
      lastTrackId: "c2",
    });
    const fresh = createMusicPrefsStore(storage);
    expect(fresh.load()?.lastTrackId).toBe("c2");
  });

  it("loads old values without the key and keeps them absent on merge", () => {
    const { storage } = fakeStorage({
      [MUSIC_PREFS_KEY]: JSON.stringify({ style: "piano", volume: 0.5, muted: false }),
    });
    const prefs = createMusicPrefsStore(storage);
    expect(prefs.load()).toEqual({ style: "piano", volume: 0.5, muted: false, playlist: false });
    expect(prefs.update({ volume: 0.3 })).toEqual({
      style: "piano",
      volume: 0.3,
      muted: false,
      playlist: false,
    });
  });

  it("falls back to null for a non-string id", () => {
    const { storage } = fakeStorage({
      [MUSIC_PREFS_KEY]: JSON.stringify({ style: null, lastTrackId: 42 }),
    });
    expect(createMusicPrefsStore(storage).load()?.lastTrackId).toBeNull();
  });

  it("a later track change never clobbers style or Chopin mode", () => {
    const { storage } = fakeStorage({
      [MUSIC_PREFS_KEY]: JSON.stringify({ style: "piano", playlist: true, lastTrackId: "a" }),
    });
    const prefs = createMusicPrefsStore(storage);
    prefs.load();
    expect(prefs.update({ lastTrackId: "b" })).toEqual({
      style: "piano",
      volume: null,
      muted: false,
      playlist: true,
      lastTrackId: "b",
    });
  });
});
