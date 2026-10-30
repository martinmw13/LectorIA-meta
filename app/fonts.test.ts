// No face may preload: the skin is chosen client-side from
// localStorage, so preloaded fonts would compete with the LCP hero image
// for skins the visitor may never use. next/font is mocked below, so
// this test never touches the network.
import { describe, expect, it, vi } from "vitest";

type FontOptions = {
  subsets?: string[];
  weight?: string | string[];
  style?: string | string[];
  variable?: string;
  display?: string;
  preload?: boolean;
};

const seen = vi.hoisted(() => ({}) as Record<string, FontOptions | undefined>);
vi.mock("next/font/google", () => {
  const face =
    (name: string) =>
    (options: FontOptions): { variable: string } => {
      seen[name] = options;
      return { variable: options.variable ?? "" };
    };
  return {
    Bangers: face("Bangers"),
    Caveat: face("Caveat"),
    Comic_Neue: face("Comic_Neue"),
    Cormorant_Garamond: face("Cormorant_Garamond"),
    Crimson_Pro: face("Crimson_Pro"),
    EB_Garamond: face("EB_Garamond"),
    IM_Fell_English: face("IM_Fell_English"),
    IM_Fell_English_SC: face("IM_Fell_English_SC"),
    Instrument_Sans: face("Instrument_Sans"),
    Jost: face("Jost"),
    Kalam: face("Kalam"),
    Klee_One: face("Klee_One"),
    Lora: face("Lora"),
    Newsreader: face("Newsreader"),
  };
});

import { rootFontClass } from "./fonts";
import { homeFontClass } from "./home/fonts";

// Weights and styles as shipped; dropping one changes lettering.
const EXPECTED: Record<string, { weight?: unknown; style?: unknown }> = {
  Newsreader: { style: ["normal", "italic"] },
  Instrument_Sans: {},
  IM_Fell_English: { weight: "400", style: ["normal", "italic"] },
  IM_Fell_English_SC: { weight: "400" },
  EB_Garamond: { style: ["normal", "italic"] },
  Caveat: { weight: ["400", "500", "700"] },
  Lora: { style: ["normal", "italic"] },
  Kalam: { weight: ["400", "700"] },
  Jost: { weight: ["400", "500", "600"] },
  Crimson_Pro: { style: ["normal", "italic"] },
  Cormorant_Garamond: { weight: ["500", "600"], style: ["normal", "italic"] },
  Bangers: { weight: "400" },
  Comic_Neue: { weight: ["400", "700"], style: ["normal", "italic"] },
  Klee_One: { weight: "600" },
};

describe("font faces", () => {
  it("preload nothing, stay latin swap", () => {
    expect(Object.keys(seen).sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const [name, options] of Object.entries(seen)) {
      expect(options?.preload, `${name} preload`).toBe(false);
      expect(options?.subsets, `${name} subsets`).toEqual(["latin"]);
      expect(options?.display, `${name} display`).toBe("swap");
    }
  });

  it("keeps the shipped weights and styles", () => {
    for (const [name, want] of Object.entries(EXPECTED)) {
      expect(seen[name]?.weight ?? null, `${name} weight`).toEqual(want.weight ?? null);
      expect(seen[name]?.style ?? null, `${name} style`).toEqual(want.style ?? null);
    }
  });

  it("wires every variable into the font classes", () => {
    for (const variable of [
      "--font-newsreader",
      "--font-instrument",
      "--font-fell",
      "--font-fell-sc",
      "--font-garamond",
      "--font-caveat",
      "--font-lora",
      "--font-kalam",
      "--font-jost",
      "--font-crimson",
      "--font-cormorant",
    ]) {
      expect(rootFontClass).toContain(variable);
    }
    for (const variable of ["--font-bangers", "--font-comic-neue", "--font-klee"]) {
      expect(homeFontClass).toContain(variable);
    }
  });
});
