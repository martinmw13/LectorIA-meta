// Dark-mode skin contrast: parses the CSS values and checks WCAG AA (4.5
// for text, 3.0 for large text). The light-value assertions pin the light
// rules so a dark fix can't silently restyle light mode.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const base = import.meta.url;
function css(path: string): string {
  return readFileSync(new URL(path, base), "utf8");
}

const tokens = css("../tokens.css");
const skins = css("./skins.css");
const pencil = css("./skin-pencil.css");
const comic = css("./skin-comic.css");
const chihiro = css("./skin-chihiro.css");

function firstGroup(text: string, re: RegExp): string {
  const found = text.match(re)?.[1];
  if (!found) throw new Error(`no match for ${re}`);
  return found;
}

function luminance(hex: string): number {
  const channel = (i: number): number => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function ratio(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  const hi = Math.max(x, y);
  const lo = Math.min(x, y);
  return (hi + 0.05) / (lo + 0.05);
}

// The dark paper every skin shares.
const darkBg = firstGroup(tokens, /html\[data-theme="dark"\]\s*\{[^}]*?--color-surface:\s*(#[0-9a-f]{6})/);
const darkText = firstGroup(tokens, /html\[data-theme="dark"\]\s*\{[^}]*?--color-text:\s*(#[0-9a-f]{6})/);

function pencilDark(tail: string): string {
  return firstGroup(
    pencil,
    new RegExp(`html\\[data-skin="pencil"\\]\\[data-theme="dark"\\] ${tail}\\s*\\{[^}]*?color:\\s*(#[0-9a-fA-F]{6})`),
  );
}

describe("skin dark-mode contrast", () => {
  test("pencil dark headings pass as large text", () => {
    expect(ratio(pencilDark(String.raw`h2\.chapter-title`), darkBg)).toBeGreaterThanOrEqual(3);
    expect(ratio(pencilDark(String.raw`\.cover-num`), darkBg)).toBeGreaterThanOrEqual(3);
  });

  test("pencil dark small text passes", () => {
    expect(ratio(pencilDark(String.raw`:is\(\.kicker, \.mlabel\)`), darkBg)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(pencilDark(String.raw`\.book-section \+ \.book-section::before`), darkBg)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(pencilDark(String.raw`:is\(\.sticker, \.chopin, \.player \.skip\.rain\)::after`), darkBg)).toBeGreaterThanOrEqual(4.5);
  });

  test("pencil dark drop cap passes as large text", () => {
    expect(
      ratio(
        pencilDark(String.raw`\.book-section \.body-text > p:first-of-type:not\(\[data-cont\]\)::first-letter`),
        darkBg,
      ),
    ).toBeGreaterThanOrEqual(3);
  });

  test("comic labels follow the theme text colour", () => {
    for (const tail of [
      String.raw`:is\(\.stickers\[data-art="hero"\] \.sticker, \.sticker-wrap \.chopin\)::after`,
      String.raw`\.read-aloud-label`,
    ]) {
      const value = firstGroup(
        comic,
        new RegExp(`html\\[data-skin="comic"\\] ${tail}\\s*\\{[^}]*?color:\\s*([^;]+);`),
      );
      expect(value.trim()).toBe("var(--color-text)");
    }
    // So dark mode gets the shared light text, and light mode is unchanged.
    expect(ratio(darkText, darkBg)).toBeGreaterThanOrEqual(4.5);
    expect(
      firstGroup(skins, /html\[data-skin="comic"\]\[data-theme="light"\]\s*\{[^}]*?--color-text:\s*(#[0-9a-f]{6})/),
    ).toBe("#14161c");
  });

  test("chihiro dark captions pass", () => {
    const caption = firstGroup(
      chihiro,
      /html\[data-skin="chihiro"\]\[data-theme="dark"\][^{]*\{[^}]*?color:\s*(#[0-9a-fA-F]{6})/,
    );
    expect(ratio(caption, darkBg)).toBeGreaterThanOrEqual(4.5);
  });

  test("light values are untouched", () => {
    expect(firstGroup(pencil, /html\[data-skin="pencil"\] h2\.chapter-title\s*\{[^}]*?color:\s*(#[0-9a-fA-F]{6})/)).toBe(
      "#24272b",
    );
    expect(firstGroup(pencil, /html\[data-skin="pencil"\] \.cover-num\s*\{[^}]*?color:\s*(#[0-9a-fA-F]{6})/)).toBe(
      "#3a3d42",
    );
    expect(
      firstGroup(pencil, /html\[data-skin="pencil"\] :is\(\.kicker, \.mlabel\)\s*\{[^}]*?color:\s*(#[0-9a-fA-F]{6})/),
    ).toBe("#5d6168");
    expect(firstGroup(chihiro, /color: (#9c2f1e);/)).toBe("#9c2f1e");
  });
});
