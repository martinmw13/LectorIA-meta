// Classic-skin music motion overlay, ported 1:1 from the approved prototype
// (.muse-ref/music-fx.inject.html): per-mode hover notes from note()/pair()
// plus the per-mode click signature (orchestra swirls + ride notes, piano
// keys + pop notes, chopin ring(s) + burst notes) and, for ink, the .keep
// circle on the CIRC path. Rendered only for engraving/watercolor/ink and
// only next to <ButtonFx kind="music" />. Still at rest: every particle sits
// at opacity 0 until :hover or the data-burst flag plays it.
// PIANO KEYS FIX: the prototype parks the keyboard at y=-34 (above the art,
// over the reader footer). Here the whole keyboard sits inside the art box:
// white keys span y=76..98, black keys y=76..89, and the pop notes rise from
// just above the keys (y 66..70). Nothing goes above y=-8 or below y=104.
"use client";

import { useId, type CSSProperties } from "react";
import { useSkin } from "../use-skin";

export type ClassicMusicMode = "orchestra" | "piano" | "chopin";

type ClassicSkin = "engraving" | "watercolor" | "ink";

const CIRC =
  "M50 9C72 7 91 24 90 48C89 72 71 90 48 89C25 88 9 70 10 47C11 26 28 10 52 10C60 10 66 12 70 15";

// "a:1;b:2" extras from the prototype pair()/note() calls become style keys.
function extraStyle(extra: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of extra.split(";")) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k && v) out[k] = v;
  }
  return out;
}

function Note({
  x,
  y,
  s = 1,
  cls = "",
  i = 0,
  extra = "",
}: {
  x: number;
  y: number;
  s?: number;
  cls?: string;
  i?: number;
  extra?: string;
}) {
  return (
    <g className={cls} style={{ "--i": i, ...extraStyle(extra) } as CSSProperties}>
      <ellipse className="halo" cx={x} cy={y} rx={9 * s} ry={7 * s} />
      <ellipse
        className="nh"
        cx={x}
        cy={y}
        rx={5 * s}
        ry={3.7 * s}
        transform={`rotate(-22 ${x} ${y})`}
      />
      <path
        className="ns"
        d={`M${x + 4.6 * s} ${y - 1 * s}V${y - 19 * s}c${2 * s} ${4 * s} ${8 * s} ${5 * s} ${7 * s} ${12 * s}`}
      />
    </g>
  );
}

function Pair({
  x,
  y,
  s = 1,
  cls = "",
  i = 0,
  extra = "",
}: {
  x: number;
  y: number;
  s?: number;
  cls?: string;
  i?: number;
  extra?: string;
}) {
  return (
    <g className={cls} style={{ "--i": i, ...extraStyle(extra) } as CSSProperties}>
      <ellipse className="halo" cx={x + 6 * s} cy={y - 2 * s} rx={13 * s} ry={8 * s} />
      <ellipse
        className="nh"
        cx={x}
        cy={y}
        rx={5 * s}
        ry={3.7 * s}
        transform={`rotate(-22 ${x} ${y})`}
      />
      <ellipse
        className="nh"
        cx={x + 12 * s}
        cy={y - 4 * s}
        rx={5 * s}
        ry={3.7 * s}
        transform={`rotate(-22 ${x + 12 * s} ${y - 4 * s})`}
      />
      <path
        className="ns"
        d={`M${x + 4.6 * s} ${y - 1 * s}V${y - 19 * s}M${x + 16.6 * s} ${y - 5 * s}V${y - 23 * s}`}
      />
      <path
        className="ns"
        style={{ strokeWidth: 3.2 }}
        d={`M${x + 4.6 * s} ${y - 19 * s}L${x + 16.6 * s} ${y - 23 * s}`}
      />
    </g>
  );
}

function HoverNotes({ mode }: { mode: ClassicMusicMode }) {
  if (mode === "orchestra") {
    return (
      <>
        <Note x={92} y={30} s={1} cls="rise" i={0} />
        <Note x={104} y={54} s={0.85} cls="rise" i={1} />
        <Note x={6} y={22} s={0.8} cls="rise" i={2} />
      </>
    );
  }
  if (mode === "piano") {
    return (
      <>
        <Note x={84} y={46} s={0.8} cls="step" i={0} />
        <Note x={98} y={32} s={0.9} cls="step" i={1} />
        <Note x={112} y={18} s={1} cls="step" i={2} />
      </>
    );
  }
  return (
    <>
      <Pair x={86} y={30} s={0.95} cls="pair" i={0} />
      <Note x={4} y={26} s={0.75} cls="rise" i={1} />
    </>
  );
}

const BLACK_AT = [0, 1, 3, 4, 5];

function ClickSig({ mode, skin }: { mode: ClassicMusicMode; skin: ClassicSkin }) {
  if (mode === "orchestra") {
    return (
      <>
        <path
          className="ln sw draw"
          style={{ "--i": 0 } as CSSProperties}
          pathLength="1"
          d="M-30 78C0 40 34 104 64 66S112 24 136 44"
        />
        <path
          className="ln2 sw draw"
          style={{ "--i": 1 } as CSSProperties}
          pathLength="1"
          d="M-32 50C-4 24 28 70 58 40S106 0 132 14"
        />
        {skin === "engraving" ? (
          <path
            className="ln2 sw draw"
            style={{ "--i": 2 } as CSSProperties}
            pathLength="1"
            d="M-30 82C0 44 34 108 64 70S112 28 136 48"
          />
        ) : (
          <path
            className="ln sw draw"
            style={{ "--i": 2 } as CSSProperties}
            pathLength="1"
            d="M-26 98C6 74 40 118 72 92S118 64 134 74"
          />
        )}
        <Note x={10} y={58} s={0.85} cls="ride" i={0} />
        <Note x={44} y={40} s={0.75} cls="ride" i={1} />
        <Note x={70} y={62} s={0.9} cls="ride" i={2} />
      </>
    );
  }
  if (mode === "piano") {
    return (
      <>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <rect
            key={i}
            className="key"
            style={{ "--i": i } as CSSProperties}
            x={-4 + i * 15.4}
            y="76"
            width="13"
            height="22"
            rx={skin === "watercolor" ? 4 : 1.5}
          />
        ))}
        {BLACK_AT.map((at, i) => (
          <rect
            key={at}
            className="key blk"
            style={{ "--i": i + 0.5, fill: "var(--b2)" } as CSSProperties}
            x={6.5 + at * 15.4}
            y="76"
            width="8"
            height="13"
            rx="1"
          />
        ))}
        <Note x={6} y={68} s={0.75} cls="pop" i={0} />
        <Note x={52} y={66} s={0.85} cls="pop" i={1} />
        <Note x={98} y={68} s={0.75} cls="pop" i={2} />
      </>
    );
  }
  return (
    <>
      <path className="ln ring draw" style={{ "--i": 0 } as CSSProperties} pathLength="1" d={CIRC} />
      {skin === "engraving" ? (
        <path
          className="ln2 ring draw"
          style={{ "--i": 1 } as CSSProperties}
          pathLength="1"
          transform="translate(50 50) scale(1.1) translate(-50 -50)"
          d={CIRC}
        />
      ) : null}
      {skin === "watercolor" ? (
        <path
          className="ln2 ring draw"
          style={{ "--i": 1 } as CSSProperties}
          pathLength="1"
          d={CIRC}
        />
      ) : null}
      <Note x={96} y={26} s={0.8} cls="burst" i={0} extra="--dx:14px;--dy:-18px;--r:12deg" />
      <Note x={2} y={20} s={0.75} cls="burst" i={1} extra="--dx:-14px;--dy:-16px;--r:-12deg" />
      <Pair x={70} y={96} s={0.7} cls="burst" i={2} extra="--dx:10px;--dy:12px;--r:6deg" />
    </>
  );
}

export function ClassicMusicFx({ mode }: { mode: ClassicMusicMode }) {
  const skin = useSkin();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (skin !== "engraving" && skin !== "watercolor" && skin !== "ink") return null;
  const hatch = `${uid}-hatch`;
  const wash = `${uid}-wash`;
  const blur = `${uid}-blur`;
  const wob = `${uid}-wob`;
  return (
    <svg
      className={`mfx sk-${skin}`}
      viewBox="-40 -50 180 160"
      aria-hidden="true"
      focusable="false"
      style={
        {
          "--mfx-hatch": `url(#${hatch})`,
          "--mfx-wash": `url(#${wash})`,
          "--mfx-blur": `url(#${blur})`,
          "--mfx-wob": `url(#${wob})`,
        } as CSSProperties
      }
    >
      <defs>
        <pattern
          id={hatch}
          width="3"
          height="3"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-35)"
        >
          <rect width="3" height="3" fill="#fff" />
          <line x1="0" y1="0" x2="0" y2="3" stroke="#0A3F9E" strokeWidth="1.3" />
        </pattern>
        <filter id={wash} x="-40%" y="-40%" width="180%" height="180%">
          <feTurbulence type="fractalNoise" baseFrequency=".08" numOctaves="2" seed="4" result="n" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale="4"
            xChannelSelector="R"
            yChannelSelector="G"
            result="d"
          />
          <feGaussianBlur in="d" stdDeviation=".8" />
        </filter>
        <filter id={blur} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
        <filter id={wob} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="9" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      {skin === "ink" && mode === "chopin" ? (
        <path
          className="keep draw"
          pathLength="1"
          d={CIRC}
          style={
            {
              fill: "none",
              stroke: "#0866FF",
              strokeWidth: 2,
              strokeLinecap: "round",
              filter: `url(#${wob})`,
            } as CSSProperties
          }
        />
      ) : null}
      <g className="h">
        <HoverNotes mode={mode} />
      </g>
      <g className="c">
        <ClickSig mode={mode} skin={skin} />
      </g>
    </svg>
  );
}
