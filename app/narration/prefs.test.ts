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
  it("defaults to off with the default volume", () => {
    expect(loadNarrationPrefs(mem())).toEqual({ on: false, volume: DEFAULT_NARRATION_VOLUME });
  });

  it("round-trips on and volume through the documented key", () => {
    const storage = mem();
    saveNarrationPrefs(storage, { on: true, volume: 0.3 });
    expect(storage.raw.get(NARRATION_PREFS_KEY)).toContain("0.3");
    expect(loadNarrationPrefs(storage)).toEqual({ on: true, volume: 0.3 });
  });

  it("ignores bad shapes and out-of-range volumes", () => {
    expect(loadNarrationPrefs(mem({ [NARRATION_PREFS_KEY]: "oops" }))).toEqual({
      on: false,
      volume: DEFAULT_NARRATION_VOLUME,
    });
    expect(loadNarrationPrefs(mem({ [NARRATION_PREFS_KEY]: JSON.stringify({ on: true, volume: 9 }) }))).toEqual({
      on: true,
      volume: DEFAULT_NARRATION_VOLUME,
    });
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
    expect(loadNarrationPrefs(broken)).toEqual({ on: false, volume: DEFAULT_NARRATION_VOLUME });
    expect(() => saveNarrationPrefs(broken, { on: true, volume: 0.5 })).not.toThrow();
  });
});
