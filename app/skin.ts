export const SKINS = ["default"] as const;
export type SkinId = (typeof SKINS)[number];
export const DEFAULT_SKIN: SkinId = "default";

export function isSkinId(v: unknown): v is SkinId {
  return (SKINS as readonly unknown[]).includes(v);
}
