import type { ReactNode, SVGProps } from "react";
import { DEFAULT_SKIN, type SkinId } from "./skin";
import { RAIN_ICONS, type RainIconName } from "./icons-rain";

export type IconName = "moon" | "sun" | "eye-off" | "pencil" | "picture" | "expand" | RainIconName;

export interface IconDef {
  width: number;
  height: number;
  viewBox: string;
  body: ReactNode;
}

// Verbatim copies of the inline SVGs the folio call sites had. The base set
// renders byte-identical markup for every skin.
export const BASE_ICONS: Record<string, IconDef> = {
  moon: {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    body: <path d="M13.5 9.5A5.8 5.8 0 0 1 6.5 2.5a5.8 5.8 0 1 0 7 7Z" />,
  },
  sun: {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    body: (
      <>
        <circle cx="8" cy="8" r="3.2" />
        <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2 3.4 12.6" />
      </>
    ),
  },
  "eye-off": {
    width: 14,
    height: 14,
    viewBox: "0 0 16 16",
    body: (
      <path d="M2.5 2.5l11 11M6.6 3.2c.5-.1 1-.2 1.4-.2 2.8 0 5.2 2.4 6 5-1 3.2-3.2 5-6 5-1 0-2-.3-2.8-.7M4 4.6C2.7 5.7 2 7 2 8c.8 2.6 3.2 5 6 5 1 0 2-.3 2.9-.8" />
    ),
  },
  pencil: {
    width: 18,
    height: 18,
    viewBox: "0 0 16 16",
    body: <path d="M11.5 2.5l2 2L5 13l-2.7.7L3 11l8.5-8.5Z" />,
  },
  picture: {
    width: 13,
    height: 13,
    viewBox: "0 0 16 16",
    body: (
      <>
        <rect x="2.5" y="2.5" width="11" height="11" />
        <circle cx="6" cy="7" r="1.4" />
        <path d="M3.5 13 7 9.5l2.5 2.5 2-2 1 1" />
      </>
    ),
  },
  expand: {
    width: 11,
    height: 11,
    viewBox: "0 0 16 16",
    body: <path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" />,
  },
};

export const ICON_SETS: Record<SkinId, Partial<Record<IconName, IconDef>>> = {
  engraving: RAIN_ICONS.engraving,
  watercolor: RAIN_ICONS.watercolor,
  ink: RAIN_ICONS.ink,
};

export function Icon({
  name,
  size,
  skin = DEFAULT_SKIN,
  ...rest
}: { name: IconName; size?: number; skin?: SkinId } & SVGProps<SVGSVGElement>) {
  const def = ICON_SETS[skin]?.[name] ?? BASE_ICONS[name];
  if (!def) throw new Error(`unknown icon: ${name}`);
  return (
    <svg width={size ?? def.width} height={size ?? def.height} viewBox={def.viewBox} aria-hidden="true" {...rest}>
      {def.body}
    </svg>
  );
}
