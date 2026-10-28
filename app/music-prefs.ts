// Persisted music prefs: style only. Storage can throw (private
// mode), so every access is guarded and falls back. Old values with
// mode or soundtrackId load safely: unknown fields are ignored.
import type { PersistedMusicPrefs } from "@/core/music";

export const MUSIC_PREFS_KEY = "lectoria.music.v1";

export function loadMusicPrefs(): PersistedMusicPrefs | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(MUSIC_PREFS_KEY);
    if (!raw) return null;
    const json: unknown = JSON.parse(raw);
    if (typeof json !== "object" || json === null) return null;
    const { style } = json as Record<string, unknown>;
    return {
      style: typeof style === "string" ? style : null,
    };
  } catch {
    return null;
  }
}

export function saveMusicPrefs(prefs: PersistedMusicPrefs): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(MUSIC_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode: playback continues without persistence.
  }
}
