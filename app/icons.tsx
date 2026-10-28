import type { ReactNode, SVGProps } from "react";
import { DEFAULT_SKIN, type SkinId } from "./skin";
import { RAIN_ICONS, type RainIconName } from "./icons-rain";
import { RAIN_ICONS_EXTRA } from "./icons-rain-extra";

export type IconName =
  | "moon"
  | "sun"
  | "eye-off"
  | "pencil"
  | "picture"
  | "expand"
  | "read-aloud"
  | "ink-circle"
  | "upload"
  | "key"
  | "external"
  | "heart"
  | "book"
  | "brush"
  | "check-box"
  | RainIconName;

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
  // Open book with two sound-wave arcs: the read-aloud control.
  "read-aloud": {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    body: (
      <>
        <path d="M1.8 4.2c1.2-.5 2.5-.5 3.7 0 1.2-.5 2.5-.5 3.7 0V12c-1.2-.5-2.5-.5-3.7 0-1.2-.5-2.5-.5-3.7 0Z" />
        <path d="M5.5 4.2v7.8" />
        <path d="M10.8 6.4a2.4 2.4 0 0 1 0 3.2" />
        <path d="M12.4 4.9a4.6 4.6 0 0 1 0 6.2" />
      </>
    ),
  },
  // Paintbrush for the style-stamp medal. Callers set the stroke.
  brush: {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    body: (
      <>
        <path d="M20.5 3.5 14 10" />
        <path d="M13.2 10.8C10 12 6.6 15 5.2 19.3L4.5 21l1.7-.7c4.3-1.4 7.3-4.8 8.5-8Z" />
        <path d="M12.6 9.4l2.1 2.1" />
      </>
    ),
  },
  // Loose hand-drawn circle for the ink-doodle word mark. Sized by the
  // caller with preserveAspectRatio="none" so it hugs the word rect.
  "ink-circle": {
    width: 100,
    height: 44,
    viewBox: "0 0 100 44",
    body: <path d="M50 -2 C 80 -3, 104 10, 100 28 C 96 44, 20 46, 4 30 C -6 16, 18 1, 56 2" />,
  },
  // Home spread set: 24-grid stroke icons, stroked by the caller in
  // currentColor. check-box carries the ob-tick hook the home CSS flips.
  upload: {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    body: (
      <>
        <path d="M12 15V3" />
        <path d="M7 8l5-5 5 5" />
        <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
      </>
    ),
  },
  key: {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    body: (
      <>
        <circle cx="7.5" cy="15.5" r="4" />
        <path d="M10.5 12.5 20 3" />
        <path d="M15.5 7.5 18 10" />
      </>
    ),
  },
  external: {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    body: (
      <>
        <path d="M14 4h6v6" />
        <path d="M20 4 10 14" />
        <path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" />
      </>
    ),
  },
  heart: {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    body: (
      <path d="M12 20S4.5 15.6 3 11.4C1.9 8.3 3.8 5 7 5c2 0 3.4 1.1 5 3.3C13.6 6.1 15 5 17 5c3.2 0 5.1 3.3 4 6.4C19.5 15.6 12 20 12 20Z" />
    ),
  },
  book: {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    body: (
      <>
        <path d="M12 6.5C10 5 7 4.5 4 4.5v14c3 0 6 .5 8 2 2-1.5 5-2 8-2v-14c-3 0-6 .5-8 2Z" />
        <path d="M12 6.5v14" />
      </>
    ),
  },
  "check-box": {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    body: (
      <>
        <rect x="3.5" y="3.5" width="17" height="17" />
        <path
          className="ob-tick"
          d="M7 12.6l3.6 3.6L17.5 8.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  },
};

export const ICON_SETS: Record<SkinId, Partial<Record<IconName, IconDef>>> = {
  engraving: RAIN_ICONS.engraving ?? {},
  watercolor: RAIN_ICONS.watercolor ?? {},
  ink: RAIN_ICONS.ink ?? {},
  pencil: RAIN_ICONS_EXTRA.pencil,
  comic: RAIN_ICONS_EXTRA.comic,
  chihiro: RAIN_ICONS_EXTRA.chihiro,
};

// The one fallback rule: a skin draws its own icon when it has one,
// otherwise the default skin's (and BASE_ICONS below that).
export function iconSkin(name: IconName, skin: SkinId): SkinId {
  return ICON_SETS[skin]?.[name] ? skin : DEFAULT_SKIN;
}

export function Icon({
  name,
  size,
  skin = DEFAULT_SKIN,
  ...rest
}: { name: IconName; size?: number; skin?: SkinId } & SVGProps<SVGSVGElement>) {
  const def = ICON_SETS[iconSkin(name, skin)]?.[name] ?? BASE_ICONS[name];
  if (!def) throw new Error(`unknown icon: ${name}`);
  return (
    <svg width={size ?? def.width} height={size ?? def.height} viewBox={def.viewBox} aria-hidden="true" {...rest}>
      {def.body}
    </svg>
  );
}
