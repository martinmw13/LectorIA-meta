// Persisted image style for POST /api/images. Modelled on music-prefs:
// storage can throw (private mode), so every access is guarded. Shape is
// validated, never throws; the server re-checks the text rules.
import { IMAGE_STYLE_PRESETS } from "@/core/image-style";
import type { ImageStylePresetId, StyleChoice } from "@/core/image-style";

export const IMAGE_STYLE_PREFS_KEY = "lectoria.imageStyle.v1";

const PRESET_IDS: ReadonlySet<string> = new Set(IMAGE_STYLE_PRESETS.map((p) => p.id));

function validChoice(json: unknown): StyleChoice | null {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return null;
  const keys = Object.keys(json);
  if (keys.length !== 1) return null;
  const record = json as Record<string, unknown>;
  if (keys[0] === "preset") {
    return typeof record.preset === "string" && PRESET_IDS.has(record.preset)
      ? { preset: record.preset as ImageStylePresetId }
      : null;
  }
  if (keys[0] === "custom") {
    return typeof record.custom === "string" && record.custom.length > 0
      ? { custom: record.custom }
      : null;
  }
  return null;
}

export function loadImageStyle(): StyleChoice | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(IMAGE_STYLE_PREFS_KEY);
    if (!raw) return null;
    return validChoice(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveImageStyle(choice: StyleChoice | null): void {
  try {
    if (typeof window === "undefined") return;
    if (choice === null) window.localStorage.removeItem(IMAGE_STYLE_PREFS_KEY);
    else window.localStorage.setItem(IMAGE_STYLE_PREFS_KEY, JSON.stringify(choice));
  } catch {
    // Private mode: new images fall back to the default style.
  }
}
