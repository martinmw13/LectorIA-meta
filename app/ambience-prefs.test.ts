import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AMBIENCE_PREFS_KEY,
  loadAmbiencePrefs,
  saveAmbiencePrefs,
} from "./ambience-prefs";

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

describe("ambience prefs", () => {
  it("returns null with no stored choice and no window", () => {
    expect(loadAmbiencePrefs()).toBeNull();
  });

  it("round-trips level and volume", () => {
    const store = stubStorage();
    saveAmbiencePrefs({ level: "moderate", volume: 0.7 });
    expect(loadAmbiencePrefs()).toEqual({ level: "moderate", volume: 0.7 });
    expect(store[AMBIENCE_PREFS_KEY]).toContain("moderate");
  });

  it("falls back on bad json or bad values", () => {
    const store = stubStorage();
    store[AMBIENCE_PREFS_KEY] = "not json";
    expect(loadAmbiencePrefs()).toBeNull();
    store[AMBIENCE_PREFS_KEY] = JSON.stringify({ level: "hail", volume: 9 });
    expect(loadAmbiencePrefs()).toEqual({ level: "off", volume: 0.4 });
    store[AMBIENCE_PREFS_KEY] = JSON.stringify({ level: "storm" });
    expect(loadAmbiencePrefs()).toEqual({ level: "storm", volume: 0.4 });
  });

  it("survives storage exceptions on load and save", () => {
    stubStorage({}, true);
    expect(loadAmbiencePrefs()).toBeNull();
    expect(() => saveAmbiencePrefs({ level: "off", volume: 0.4 })).not.toThrow();
  });
});
