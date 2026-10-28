import { initialTheme, THEME_KEY, THEME_SCRIPT } from "./theme";
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

  it("builds the inline script from THEME_KEY", () => {
    expect(THEME_KEY).toBe("lectoria.theme");
    expect(THEME_SCRIPT).toContain(JSON.stringify(THEME_KEY));
  });

  it("inline script resolves stored values to a data-theme", () => {
    const run = (stored: unknown): string => {
      let theme = "";
      const localStorage = {
        getItem: () => {
          if (stored === "throw") throw new Error("denied");
          return stored;
        },
      };
      const document = {
        documentElement: {
          setAttribute: (_key: string, value: string) => {
            theme = value;
          },
        },
      };
      new Function("localStorage", "document", THEME_SCRIPT)(localStorage, document);
      return theme;
    };
    expect(run(null)).toBe("light");
    expect(run("garbage")).toBe("light");
    expect(run("dark")).toBe("dark");
    expect(run("light")).toBe("light");
    expect(run("throw")).toBe("light");
  });
});
