import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SKIN,
  SKIN_KEY,
  SKINS,
  SKIN_SCRIPT,
  cycleSkin,
  getSkin,
  initialSkin,
  isSkinId,
  setSkin,
  subscribe,
} from "./skin";

describe("skin", () => {
  it("ships five skins with engraving first", () => {
    expect(SKINS).toEqual(["engraving", "watercolor", "ink", "comic", "anime-ghibli"]);
    expect(DEFAULT_SKIN).toBe("engraving");
  });

  it("accepts only known skin ids", () => {
    for (const skin of SKINS) expect(isSkinId(skin)).toBe(true);
    expect(isSkinId("default")).toBe(false);
    expect(isSkinId(undefined)).toBe(false);
    expect(isSkinId(null)).toBe(false);
  });
});

describe("initialSkin", () => {
  it("prefers a valid ?skin= param over the stored value", () => {
    expect(initialSkin("ink", "?skin=watercolor")).toBe("watercolor");
  });

  it("falls back to a valid stored value without a param", () => {
    expect(initialSkin("ink", "")).toBe("ink");
    expect(initialSkin("comic")).toBe("comic");
  });

  it("ignores invalid params and stored values", () => {
    expect(initialSkin("ink", "?skin=default")).toBe("ink");
    expect(initialSkin("garbage", "?skin=default")).toBe("engraving");
    expect(initialSkin("garbage", "")).toBe("engraving");
    expect(initialSkin(null)).toBe("engraving");
  });
});

describe("SKIN_SCRIPT", () => {
  const run = (search: string, stored: unknown): { skin: string; saved: Record<string, string> } => {
    let skin = "";
    const saved: Record<string, string> = {};
    const localStorage = {
      getItem: () => {
        if (stored === "throw") throw new Error("denied");
        return stored;
      },
      setItem: (key: string, value: string) => {
        saved[key] = value;
      },
    };
    const document = {
      documentElement: {
        dataset: {
          set skin(v: string) {
            skin = v;
          },
        },
      },
    };
    new Function("location", "document", "localStorage", SKIN_SCRIPT)(
      { search },
      document,
      localStorage,
    );
    return { skin, saved };
  };

  it("builds the inline script from SKIN_KEY and stays in sync with initialSkin", () => {
    expect(SKIN_KEY).toBe("lectoria.skin");
    expect(SKIN_SCRIPT).toContain(JSON.stringify(SKIN_KEY));
    expect(SKIN_SCRIPT).toContain(JSON.stringify(SKINS));
    expect(SKIN_SCRIPT).toContain("try");
    for (const skin of SKINS) {
      expect(run(`?skin=${skin}`, "ink").skin).toBe(skin);
    }
  });

  it("applies a valid ?skin= param for that load without storing it", () => {
    const { skin, saved } = run("?skin=watercolor", "ink");
    expect(skin).toBe("watercolor");
    expect(saved).toEqual({});
  });

  it("applies a valid stored value without a param", () => {
    expect(run("", "ink")).toEqual({ skin: "ink", saved: {} });
  });

  it("falls back to the default on garbage and denied storage", () => {
    expect(run("?skin=default", "ink").skin).toBe("ink");
    expect(run("?skin=default", "garbage").skin).toBe("engraving");
    expect(run("", "garbage").skin).toBe("engraving");
    expect(run("", "throw").skin).toBe("engraving");
  });
});

describe("skin runtime", () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const OLD_DOCUMENT = g.document;
  const OLD_STORAGE = g.localStorage;

  afterEach(() => {
    g.document = OLD_DOCUMENT;
    g.localStorage = OLD_STORAGE;
  });

  function fakeDom(skin: unknown): { saved: Record<string, string> } {
    const saved: Record<string, string> = {};
    g.document = { documentElement: { dataset: { skin } } };
    g.localStorage = {
      getItem: (key: string) => saved[key] ?? null,
      setItem: (key: string, value: string) => {
        saved[key] = value;
      },
    };
    return { saved };
  }

  it("getSkin reads the live data-skin, defaulting when absent or invalid", () => {
    fakeDom("ink");
    expect(getSkin()).toBe("ink");
    fakeDom("garbage");
    expect(getSkin()).toBe(DEFAULT_SKIN);
    g.document = undefined;
    expect(getSkin()).toBe(DEFAULT_SKIN);
  });

  it("setSkin applies, persists and notifies; unsubscribe stops updates", () => {
    const { saved } = fakeDom("engraving");
    const seen: string[] = [];
    const unsub = subscribe(() => {
      seen.push(getSkin());
    });
    setSkin("ink");
    expect(getSkin()).toBe("ink");
    expect(saved[SKIN_KEY]).toBe("ink");
    expect(seen).toEqual(["ink"]);
    unsub();
    setSkin("watercolor");
    expect(seen).toEqual(["ink"]);
  });

  it("cycleSkin wraps around SKINS order", () => {
    fakeDom("engraving");
    const unsub = subscribe(() => {});
    try {
      expect(cycleSkin()).toBe("watercolor");
      expect(getSkin()).toBe("watercolor");
      setSkin("anime-ghibli");
      expect(cycleSkin()).toBe("engraving");
      expect(getSkin()).toBe("engraving");
    } finally {
      unsub();
    }
  });
});
