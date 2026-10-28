import { initialTheme, THEME_SCRIPT } from "./theme";
import { describe, expect, it } from "vitest";

describe("initialTheme", () => {
  it("defaults to light without an explicit stored choice", () => {
    expect(initialTheme(null)).toBe("light");
    expect(initialTheme("garbage")).toBe("light");
    expect(initialTheme("light")).toBe("light");
    expect(initialTheme("dark")).toBe("dark");
  });

  it("inline script starts in light and never reads the OS preference", () => {
    expect(THEME_SCRIPT).not.toContain("prefers-color-scheme");
    expect(THEME_SCRIPT).not.toContain("matchMedia");
    expect(THEME_SCRIPT).toContain("lectoria.theme");
    expect(initialTheme(null)).toBe("light");
  });
});
