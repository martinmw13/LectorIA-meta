// Pure folio helpers: caption truncation, pane split clamp, style pref.
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_IMAGE_STYLE,
  STYLE_OTHER_VALUE,
  loadImageStylePref,
  parseImageStylePref,
  requestStyleFields,
  resolveStyleSelect,
  saveImageStylePref,
  styleCredit,
} from "./image-style";
import { clampSplitWidth, truncateCaption } from "./folio/helpers";
import { pickEndN, pickStartN } from "./picture-selection";
import type { ParaEntry } from "./picture-selection";

describe("truncateCaption", () => {
  it("leaves a short quote whole", () => {
    expect(truncateCaption("a low wail of the wind")).toBe("a low wail of the wind");
  });

  it("cuts a long quote near 80 chars with an ellipsis", () => {
    const out = truncateCaption(`a ${"very ".repeat(30)}long line`);
    expect(out.length).toBeLessThanOrEqual(81);
    expect(out.endsWith("…")).toBe(true);
  });

  it("collapses whitespace first", () => {
    expect(truncateCaption("  a\n  b ")).toBe("a b");
  });
});

describe("clampSplitWidth", () => {
  it("holds the minimum and the 46vw maximum", () => {
    expect(clampSplitWidth(50, 1280)).toBe(220);
    expect(clampSplitWidth(900, 1280)).toBe(Math.round(1280 * 0.46));
    expect(clampSplitWidth(320, 1280)).toBe(320);
  });
});

describe("pickEndN", () => {
  const entries: ParaEntry[] = [
    { id: "c1p1", n: 1 },
    { id: "c1p2", n: 2 },
    { id: "c1p3", n: 3 },
  ];

  it("picks the later paragraph whatever the drag direction", () => {
    expect(pickEndN(entries, "c1p1", "c1p3")).toBe(3);
    expect(pickEndN(entries, "c1p3", "c1p1")).toBe(3);
  });

  it("agrees with pickStartN inside one paragraph", () => {
    expect(pickEndN(entries, "c1p2", "c1p2")).toBe(pickStartN(entries, "c1p2", "c1p2"));
  });

  it("returns null outside the book", () => {
    expect(pickEndN(entries, null, null)).toBeNull();
    expect(pickEndN(entries, "other", "missing")).toBeNull();
  });
});

describe("parseImageStylePref", () => {
  it("falls back to Denslow on bad or old values", () => {
    expect(parseImageStylePref(null)).toEqual(DEFAULT_IMAGE_STYLE);
    expect(parseImageStylePref({ kind: "preset", id: "nope" })).toEqual(DEFAULT_IMAGE_STYLE);
    expect(parseImageStylePref({ kind: "preset", id: "watercolour" })).toEqual({
      kind: "preset",
      id: "watercolour",
    });
    expect(parseImageStylePref({ kind: "custom", text: "  Japanese woodblock " })).toEqual({
      kind: "custom",
      text: "Japanese woodblock",
    });
    expect(parseImageStylePref({ kind: "custom", text: "   " })).toEqual(DEFAULT_IMAGE_STYLE);
  });

  it("round-trips through storage", () => {
    const store: Record<string, string> = {};
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
      },
    });
    try {
      saveImageStylePref({ kind: "preset", id: "pencil" });
      expect(loadImageStylePref()).toEqual({ kind: "preset", id: "pencil" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps Other… open until a preset or Escape closes it", () => {
    expect(resolveStyleSelect({ kind: "preset", id: "denslow" }, false)).toBe("denslow");
    expect(resolveStyleSelect({ kind: "preset", id: "denslow" }, true)).toBe(STYLE_OTHER_VALUE);
    expect(resolveStyleSelect({ kind: "custom", text: "Woodblock" }, false)).toBe(
      STYLE_OTHER_VALUE,
    );
  });

  it("sends no style yet and credits Denslow", () => {
    expect(requestStyleFields({ kind: "preset", id: "watercolour" })).toEqual({});
    expect(styleCredit(requestStyleFields({ kind: "preset", id: "watercolour" }))).toBe(
      "In the style of W. W. Denslow",
    );
  });
});
