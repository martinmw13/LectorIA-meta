import type { CSSProperties } from "react";
import type { IconDef } from "./icons";
import { BOLT, CLOUD, DROPS, type RainIconName, type RainState } from "./icons-rain";

// Rain art for the pencil, comic and chihiro skins. Pencil and chihiro
// use the prototype paintings (public/art/skins) with a few vector drops
// or glints on top that only move on hover or a level change; comic is
// the prototype's halftone burst, ported to SVG. viewBox 0 0 100 100.

// Pow burst: alternating long and short points around the centre.
export function burst(n: number, r1: number, r2: number, cx = 50, cy = 50): string {
  let d = "";
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? r1 : r2 + ((i * 13) % 5) - 2;
    d += `${i ? "L" : "M"}${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
  }
  return d + "Z";
}

const FX_DROPS = [0, 4, 6, 9];

function Fx({ s, drop, glint }: { s: RainState; drop: string; glint: [number, number, number][] }) {
  if (s === 0) {
    return (
      <>
        {glint.map(([x, y, r], i) => (
          <path
            key={i}
            className="fx-glint"
            style={{ "--i": i } as CSSProperties}
            d={`M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`}
            fill="#FFD45C"
          />
        ))}
      </>
    );
  }
  return (
    <>
      {Array.from({ length: FX_DROPS[s]! }, (_, i) => (
        <path
          key={i}
          className="fx-drop"
          style={{ "--i": i } as CSSProperties}
          d={`M${28 + ((i * 23) % 46)} ${82 + ((i * 13) % 9)}l-2 6`}
          stroke={drop}
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
      ))}
    </>
  );
}

function painted(skin: "pencil" | "chihiro", s: RainState): IconDef["body"] {
  const drop = skin === "pencil" ? "#55595F" : "#4E8FD6";
  const glint: [number, number, number][] = skin === "pencil" ? [[66, 26, 5], [80, 40, 3.5]] : [[80, 22, 5], [90, 36, 3.5]];
  return (
    <>
      <image className="paint" href={`/art/skins/${skin}/rain${s}.png`} width="100" height="100" />
      <Fx s={s} drop={drop} glint={glint} />
    </>
  );
}

const COMIC_HALO = ["", "url(#rb-c-dots)", "url(#rb-c-dots-y)", "url(#rb-c-dots-r)"];
const COMIC_FILL = ["none", "#FFFFFF", "url(#rb-c-dots-k)", "url(#rb-c-dots-kk)"];
const K = { stroke: "var(--rain-k)" };

function dots(id: string, size: number, bg: string, dot: string, r: number) {
  return (
    <pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse" patternTransform="rotate(20)">
      <rect width={size} height={size} fill={bg} />
      <circle cx={size / 2} cy={size / 2} r={r} fill={dot} />
    </pattern>
  );
}

function comic(s: RainState): IconDef["body"] {
  return (
    <>
      <defs>
        {dots("rb-c-dots", 5, "#FFFFFF", "#58AEFF", 1.3)}
        {dots("rb-c-dots-k", 5, "#FFFFFF", "#6B7280", 1.5)}
        {dots("rb-c-dots-kk", 4, "#9CA3AF", "#1F2430", 1.5)}
        {dots("rb-c-dots-y", 5, "#FFE45C", "#F2B705", 1.4)}
        {dots("rb-c-dots-r", 5, "#FFD5D6", "#E5484D", 1.6)}
      </defs>
      {s > 0 ? (
        <path className="halo" d={burst(14, 38, 49)} fill={COMIC_HALO[s]} style={K} strokeWidth="2" strokeLinejoin="round" />
      ) : null}
      {s > 0 ? (
        <g className="ink-in">
          <path d={CLOUD} fill={COMIC_FILL[s]} style={K} strokeWidth="3.4" strokeLinejoin="round" />
          <path d="M33 56C30 52 32 48 36 47" fill="none" style={K} strokeWidth="1.6" strokeLinecap="round" />
        </g>
      ) : (
        <path d={CLOUD} fill="#FFFFFF" style={K} strokeWidth="2.2" strokeDasharray="4 3.5" opacity=".55" />
      )}
      {DROPS[s]!.map(([x, y], i) => (
        <path
          key={i}
          className="drop"
          style={{ "--i": i, ...K } as CSSProperties}
          d={`M${x} ${y - 1}q-2.6 5 -1.6 ${s === 1 ? 6 : 8}q2.6 .4 2.8-2.4z`}
          fill="#58AEFF"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      ))}
      {s === 3 ? (
        <g className="bolt">
          <path d={BOLT} fill="#FFE45C" style={K} strokeWidth="2.4" strokeLinejoin="round" />
        </g>
      ) : null}
    </>
  );
}

function rainDef(body: IconDef["body"]): IconDef {
  return { width: 30, height: 30, viewBox: "0 0 100 100", body };
}

const LEVELS: [RainIconName, RainState][] = [
  ["rain-off", 0],
  ["rain-drizzle", 1],
  ["rain-moderate", 2],
  ["rain-storm", 3],
];

function set(art: (s: RainState) => IconDef["body"]): Record<RainIconName, IconDef> {
  return Object.fromEntries(LEVELS.map(([name, s]) => [name, rainDef(art(s))])) as Record<RainIconName, IconDef>;
}

export const RAIN_ICONS_EXTRA = {
  pencil: set((s) => painted("pencil", s)),
  comic: set(comic),
  chihiro: set((s) => painted("chihiro", s)),
};
