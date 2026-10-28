// Theme default: light unless the user explicitly stored light/dark.
// The inline script in layout.tsx must stay in sync with initialTheme
// (it cannot import this module), so keep the "light" fallback there.
export type ThemeName = "light" | "dark";

export const THEME_KEY = "lectoria.theme";

export function initialTheme(stored: unknown): ThemeName {
  return stored === "light" || stored === "dark" ? stored : "light";
}

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t!=="light"&&t!=="dark"){t="light";}document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`;
