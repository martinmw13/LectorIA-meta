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

  it("round-trips a stored choice", () => {
    const store = stubStorage();
    saveMusicPrefs({ mode: "random", soundtrackId: "orch-b", style: "orchestral" });
    expect(loadMusicPrefs()).toEqual({
      mode: "random",
      soundtrackId: "orch-b",
      style: "orchestral",
    });
    expect(store["lectoria.music.v1"]).toContain("orch-b");
  });

  it("falls back on bad json or bad values", () => {
    const store = stubStorage();
    store["lectoria.music.v1"] = "not json";
    expect(loadMusicPrefs()).toBeNull();
    store["lectoria.music.v1"] = JSON.stringify({ mode: "party", soundtrackId: 7 });
    expect(loadMusicPrefs()).toEqual({ mode: "soundtrack", soundtrackId: null, style: null });
  });

  it("survives storage exceptions on load and save", () => {
    stubStorage({}, true);
    expect(loadMusicPrefs()).toBeNull();
    expect(() =>
      saveMusicPrefs({ mode: "soundtrack", soundtrackId: null, style: null }),
    ).not.toThrow();
  });
});
