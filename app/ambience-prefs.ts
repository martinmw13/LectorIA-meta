// Persisted rain prefs: level and volume. Guarded like music-prefs:
// storage can throw, so every access falls back and never throws.
import { DEFAULT_AMBIENCE_VOLUME, parseAmbiencePrefs } from "@/core/ambience";
import type { AmbiencePrefs } from "@/core/ambience";

// A localStorage namespace, not a secret; the value trips generic-api-key.
export const AMBIENCE_PREFS_KEY = "lectoria.ambience.v1"; //gitleaks:allow

export { DEFAULT_AMBIENCE_VOLUME };

export function loadAmbiencePrefs(): AmbiencePrefs | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(AMBIENCE_PREFS_KEY);
    if (!raw) return null;
    return parseAmbiencePrefs(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function saveAmbiencePrefs(prefs: AmbiencePrefs): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AMBIENCE_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode: playback continues without persistence.
  }
}
