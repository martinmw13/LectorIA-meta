// Persisted read-aloud prefs: on/off plus a narration-only volume.
// Storage can throw (private mode), so every access is guarded.
import type { NarrationPrefs } from "./types";

export const NARRATION_PREFS_KEY = "lectoria.narration.v1";

export const DEFAULT_NARRATION_VOLUME = 0.8;

export const DEFAULT_NARRATION_PREFS: NarrationPrefs = { on: false, volume: DEFAULT_NARRATION_VOLUME };

type PrefsStorage = Pick<Storage, "getItem" | "setItem">;

function validVolume(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

export function loadNarrationPrefs(storage?: PrefsStorage): NarrationPrefs {
  try {
    const raw = storage?.getItem(NARRATION_PREFS_KEY);
    if (!raw) return { ...DEFAULT_NARRATION_PREFS };
    const json: unknown = JSON.parse(raw);
    if (typeof json !== "object" || json === null) return { ...DEFAULT_NARRATION_PREFS };
    const { on, volume } = json as Record<string, unknown>;
    return {
      on: typeof on === "boolean" ? on : false,
      volume: validVolume(volume) ?? DEFAULT_NARRATION_VOLUME,
    };
  } catch {
    return { ...DEFAULT_NARRATION_PREFS };
  }
}

export function saveNarrationPrefs(storage: PrefsStorage | undefined, prefs: NarrationPrefs): void {
  try {
    storage?.setItem(NARRATION_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode: playback continues without persistence.
  }
}
