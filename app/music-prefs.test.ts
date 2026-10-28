import { afterEach, describe, expect, it, vi } from "vitest";
import { loadMusicPrefs, saveMusicPrefs } from "./music-prefs";

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

  it("round-trips a stored style", () => {
    const store = stubStorage();
    saveMusicPrefs({ style: "orchestral" });
    expect(loadMusicPrefs()).toEqual({ style: "orchestral" });
    expect(store["lectoria.music.v1"]).toContain("orchestral");
  });

  it("loads old values by style alone and ignores unknown fields", () => {
    const store = stubStorage();
    store["lectoria.music.v1"] = JSON.stringify({
      mode: "random",
      soundtrackId: "orch-b",
      style: "orchestral",
      extra: true,
    });
    expect(loadMusicPrefs()).toEqual({ style: "orchestral" });
  });

  it("falls back on bad json or bad values", () => {
    const store = stubStorage();
    store["lectoria.music.v1"] = "not json";
    expect(loadMusicPrefs()).toBeNull();
    store["lectoria.music.v1"] = JSON.stringify({ style: 7 });
    expect(loadMusicPrefs()).toEqual({ style: null });
  });

  it("survives storage exceptions on load and save", () => {
    stubStorage({}, true);
    expect(loadMusicPrefs()).toBeNull();
    expect(() => saveMusicPrefs({ style: null })).not.toThrow();
  });
});
