// Drawing style preference for POST /api/images. Persisted in
// localStorage, parsed defensively. Preset ids come from the server's
// table so they always match; the server re-checks custom text.
import { IMAGE_STYLE_PRESETS, resolveEffectiveStyle } from "@/core/image-style";
import type { ImageStylePresetId, StyleChoice } from "@/core/image-style";

export const IMAGE_STYLE_KEY = "lectoria.imageStyle";

export type ImageStylePref = { kind: "preset"; id: string } | { kind: "custom"; text: string };

export interface StylePreset {
  id: string;
  label: string;
}

export const STYLE_PRESETS: StylePreset[] = IMAGE_STYLE_PRESETS.map(({ id, label }) => ({ id, label }));

export const DEFAULT_IMAGE_STYLE: ImageStylePref = { kind: "preset", id: "denslow" };

export const STYLE_OTHER_VALUE = "__other";

// The select shows Other… while its custom field is open, even when the
// saved pref is still a preset; Escape or a preset choice closes it.
export function resolveStyleSelect(pref: ImageStylePref, otherOpen: boolean): string {
  return otherOpen || pref.kind === "custom" ? STYLE_OTHER_VALUE : pref.id;
}

export const DENSLOW_CREDIT = "In the style of W. W. Denslow";

function toImageStylePref(json: unknown): ImageStylePref | null {
  if (typeof json === "object" && json !== null && !Array.isArray(json)) {
    const pref = json as Record<string, unknown>;
    if (pref.kind === "preset" && typeof pref.id === "string" && STYLE_PRESETS.some((p) => p.id === pref.id)) {
      return { kind: "preset", id: pref.id };
    }
    if (pref.kind === "custom" && typeof pref.text === "string" && pref.text.trim().length > 0) {
      return { kind: "custom", text: pref.text.trim().slice(0, 60) };
    }
  }
  return null;
}

export function parseImageStylePref(json: unknown): ImageStylePref {
  return toImageStylePref(json) ?? DEFAULT_IMAGE_STYLE;
}

// Null means no explicit pick stored. Invalid stored values also read
// as null so the skin default (Denslow today) applies.
export function loadImageStylePref(): ImageStylePref | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(IMAGE_STYLE_KEY);
    if (!raw) return null;
    return toImageStylePref(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

// The picker shows this; the request sends requestStyleFields of it.
// No explicit pick falls back to the skin default (Denslow today).
export function effectiveImageStylePref(pref: ImageStylePref | null, skin?: string): ImageStylePref {
  const explicit: StyleChoice | undefined =
    pref === null
      ? undefined
      : pref.kind === "custom"
        ? { custom: pref.text }
        : { preset: pref.id as ImageStylePresetId };
  const eff = resolveEffectiveStyle(explicit, skin);
  return "custom" in eff ? { kind: "custom", text: eff.custom } : { kind: "preset", id: eff.preset };
}

export function saveImageStylePref(pref: ImageStylePref): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(IMAGE_STYLE_KEY, JSON.stringify(pref));
  } catch {
    // Private mode: new pictures use the default until reload.
  }
}

// Denslow sends nothing, so its key and prompt stay byte-identical.
export function requestStyleFields(pref: ImageStylePref): { style?: StyleChoice } {
  if (pref.kind === "custom") return { style: { custom: pref.text } };
  if (pref.id === "denslow") return {};
  return { style: { preset: pref.id as ImageStylePresetId } };
}

// The credit never claims a style the request did not send.
export function styleCredit(fields: { style?: StyleChoice }): string {
  const style = fields.style;
  if (style === undefined) return DENSLOW_CREDIT;
  if ("preset" in style) {
    return STYLE_PRESETS.find((p) => p.id === style.preset)?.label ?? DENSLOW_CREDIT;
  }
  return style.custom;
}
