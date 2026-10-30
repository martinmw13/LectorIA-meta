import { describe, expect, it } from "vitest";
import { DEFAULT_NARRATION_VOLUME, loadNarrationPrefs, NARRATION_PREFS_KEY, saveNarrationPrefs } from "./prefs";

function mem(initial?: Record<string, string>) {
  const store = new Map(Object.entries(initial ?? {}));
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    raw: store,
  };
}

describe("narration prefs", () => {
  it("defaults to off with the default volume and voice", () => {
    expect(loadNarrationPrefs(mem())).toEqual({ on: false, volume: DEFAULT_NARRATION_VOLUME, voice: "af_heart" });
  });

  it("round-trips on, volume, and voice through the documented key", () => {
    const storage = mem();
    saveNarrationPrefs(storage, { on: true, volume: 0.3, voice: "am_michael" });
    expect(storage.raw.get(NARRATION_PREFS_KEY)).toContain("0.3");
    expect(loadNarrationPrefs(storage)).toEqual({ on: true, volume: 0.3, voice: "am_michael" });
  });

  it("ignores bad shapes, out-of-range volumes, and unknown voices", () => {
    expect(loadNarrationPrefs(mem({ [NARRATION_PREFS_KEY]: "oops" }))).toEqual({
      on: false,
      volume: DEFAULT_NARRATION_VOLUME,
      voice: "af_heart",
    });
    expect(loadNarrationPrefs(mem({ [NARRATION_PREFS_KEY]: JSON.stringify({ on: true, volume: 9 }) }))).toEqual({
      on: true,
      volume: DEFAULT_NARRATION_VOLUME,
      voice: "af_heart",
    });
    expect(
      loadNarrationPrefs(mem({ [NARRATION_PREFS_KEY]: JSON.stringify({ on: true, volume: 0.5, voice: "af_bella" }) })),
    ).toEqual({ on: true, volume: 0.5, voice: "af_heart" });
  });

  it("survives a throwing store", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadNarrationPrefs(broken)).toEqual({ on: false, volume: DEFAULT_NARRATION_VOLUME, voice: "af_heart" });
    expect(() => saveNarrationPrefs(broken, { on: true, volume: 0.5, voice: "af_heart" })).not.toThrow();
  });
});
