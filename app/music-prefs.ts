// Persisted music prefs: style, volume, and muted. Storage can throw
// (private mode), so every access is guarded and falls back. Old values
// load safely: unknown fields are ignored, a bad volume or muted falls
// back to the defaults.
import type { PersistedMusicPrefs } from "@/core/music";

export const MUSIC_PREFS_KEY = "lectoria.music.v1";

export const DEFAULT_VOLUME = 0.8;

function validVolume(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

export function loadMusicPrefs(): PersistedMusicPrefs | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(MUSIC_PREFS_KEY);
    if (!raw) return null;
    const json: unknown = JSON.parse(raw);
    if (typeof json !== "object" || json === null) return null;
    const { style, volume, muted } = json as Record<string, unknown>;
    return {
      style: typeof style === "string" ? style : null,
      volume: validVolume(volume),
      muted: typeof muted === "boolean" ? muted : false,
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
