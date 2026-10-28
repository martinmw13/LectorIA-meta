import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IMAGE_STYLE_PREFS_KEY,
  loadImageStyle,
  saveImageStyle,
} from "./image-style-prefs";

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
    removeItem: (key: string) => {
      if (throwing) throw new Error("denied");
      delete store[key];
    },
  };
  vi.stubGlobal("window", { localStorage: storage });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("image style prefs", () => {
  it("returns null with no stored choice and no window", () => {
    expect(loadImageStyle()).toBeNull();
  });

  it("round-trips a preset and a custom choice", () => {
    const store = stubStorage();
    saveImageStyle({ preset: "pencil" });
    expect(loadImageStyle()).toEqual({ preset: "pencil" });
    expect(store[IMAGE_STYLE_PREFS_KEY]).toContain("pencil");
    saveImageStyle({ custom: "Watercolor wash" });
    expect(loadImageStyle()).toEqual({ custom: "Watercolor wash" });
  });

  it("clears on null", () => {
    const store = stubStorage();
    saveImageStyle({ preset: "anime" });
    saveImageStyle(null);
    expect(loadImageStyle()).toBeNull();
    expect(store[IMAGE_STYLE_PREFS_KEY]).toBeUndefined();
  });

  it("returns null for bad shapes", () => {
    const store = stubStorage();
    for (const bad of [
      "not json",
      "7",
      "[]",
      "{}",
      JSON.stringify({ preset: "nope" }),
      JSON.stringify({ preset: 7 }),
      JSON.stringify({ custom: "" }),
      JSON.stringify({ custom: 7 }),
      JSON.stringify({ preset: "pencil", custom: "x" }),
      JSON.stringify({ style: "pencil" }),
    ]) {
      store[IMAGE_STYLE_PREFS_KEY] = bad;
      expect(loadImageStyle()).toBeNull();
    }
  });

  it("survives storage exceptions on load and save", () => {
    stubStorage({}, true);
    expect(loadImageStyle()).toBeNull();
    expect(() => saveImageStyle({ preset: "pencil" })).not.toThrow();
    expect(() => saveImageStyle(null)).not.toThrow();
  });
});
