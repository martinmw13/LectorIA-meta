import type { CSSProperties } from "react";
import type { IconDef } from "./icons";
import type { SkinId } from "./skin";

export type RainIconName = "rain-off" | "rain-drizzle" | "rain-moderate" | "rain-storm";
export type RainState = 0 | 1 | 2 | 3;

// Ported from the approved v2 prototypes: same cloud, drops, bolt and halo
// geometry, viewBox 0 0 100 100. Ink/paint colours live in CSS custom
// properties (ambience.css, per skin) so dark theme can override them;
// level accent colours (halos, bolt fills, washes) stay literal.
const CLOUD =
  "M30 64C18 64 14 53 21 47C19 36 31 29 40 34C44 22 62 20 68 32C80 30 89 41 84 50C90 56 86 64 77 64Z";
const CLOUD_IN = "M33 58C27 57 26 51 30 48M47 33C51 27 59 27 62 33M70 40C76 40 80 45 79 50";
const DROPS: Array<Array<[number, number]>> = [
  [],
  [
    [40, 73],
    [54, 77],
    [66, 72],
  ],
  [
    [32, 72],
    [43, 80],
    [53, 72],
    [63, 80],
    [73, 72],
    [48, 90],
    [68, 90],
  ],
  [
    [30, 72],
    [40, 82],
    [70, 82],
    [78, 72],
    [34, 92],
    [76, 92],
  ],
];
const BOLT = "M57 62L47 79H55L49 95L66 74H57.5L63 62Z";

function rays(n: number, r1: number, r2: number, jit = 0): string {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + 0.07;
    const j = jit ? (((i * 37) % 7) - 3) * jit : 0;
    const b = r1 + (i % 2 ? 0 : -2);
    const e = r2 + (i % 2 ? -3 : 0) + j;
    return `M${(50 + b * Math.cos(a)).toFixed(1)} ${(50 + b * Math.sin(a)).toFixed(1)}L${(50 + e * Math.cos(a)).toFixed(1)} ${(50 + e * Math.sin(a)).toFixed(1)}`;
  }).join("");
}

function Drops(props: { stroke: string; width: number; linecap: "square" | "round"; s: RainState }) {
  const len = props.s === 1 ? 5 : 7;
  return (
    <>
      {DROPS[props.s]!.map(([x, y], i) => (
        <path
          key={i}
          className="drop"
          style={{ "--i": i, stroke: props.stroke } as CSSProperties}
          d={`M${x} ${y}l-2.2 ${len}`}
          fill="none"
          strokeWidth={props.width}
          strokeLinecap={props.linecap}
        />
      ))}
    </>
  );
}

function engraving(s: RainState): IconDef["body"] {
  const fill = ["none", "url(#rb-hatch)", "url(#rb-hatch2)", "url(#rb-hatch2)"][s]!;
  return (
    <>
      <defs>
        <pattern id="rb-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="6" height="6" style={{ fill: "var(--rain-paper)" }} />
          <path d="M0 0V6" style={{ stroke: "var(--rain-ink)" }} strokeWidth=".7" />
        </pattern>
        <pattern id="rb-hatch2" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
          <rect width="4" height="4" style={{ fill: "var(--rain-ink)" }} />
          <path d="M0 0V4" style={{ stroke: "var(--rain-paper)" }} strokeWidth=".6" />
        </pattern>
        <pattern id="rb-e-shimmer" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
          <path d="M0 0V3" stroke="#FFFDF5" strokeWidth=".9" />
        </pattern>
        <clipPath id="rb-cloudclip">
          <path d={CLOUD} />
        </clipPath>
      </defs>
      {s > 0 ? (
        <path
          className="halo etch"
          pathLength={1}
          d={rays(32, 40, 48)}
          fill="none"
          style={{ stroke: "var(--rain-halo)" }}
          strokeWidth={s === 3 ? 2 : 1.6}
          strokeLinecap="square"
        />
      ) : null}
      {s > 0 ? (
        <path className="etch" pathLength={1} d={CLOUD} fill={fill} style={{ stroke: "var(--rain-ink)" }} strokeWidth={1.6} />
      ) : (
        <path
          d={CLOUD}
          fill="none"
          style={{ stroke: "var(--rain-ink)" }}
          strokeWidth={3.4}
          strokeDasharray="7 5.5"
          opacity=".5"
        />
      )}
      {s === 3 ? <path d={CLOUD} style={{ fill: "var(--rain-ink)" }} opacity=".38" /> : null}
      {s > 0 ? (
        <path
          d={CLOUD_IN}
          fill="none"
          style={{ stroke: s >= 2 ? "var(--rain-paper)" : "var(--rain-ink)" }}
          strokeWidth=".8"
          opacity=".8"
        />
      ) : null}
      <Drops stroke="var(--rain-ink)" width={1.6} linecap="square" s={s} />
      {s === 3 ? (
        <g className="bolt">
          <path d={BOLT} style={{ fill: "var(--rain-paper)", stroke: "var(--rain-ink)" }} strokeWidth="1.4" />
          <path d={BOLT} fill="url(#rb-hatch)" opacity=".35" />
        </g>
      ) : null}
      <rect className="shim" x="-40" y="-40" width="180" height="180" fill="url(#rb-e-shimmer)" clipPath="url(#rb-cloudclip)" />
    </>
  );
}

function watercolor(s: RainState): IconDef["body"] {
  const tone = ["none", "#C9DDF7", "#7C88A6", "#3E4866"][s]!;
  return (
    <>
      <defs>
        <filter id="rb-f-wc" x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="3" seed="5" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G" result="d" />
          <feGaussianBlur in="d" stdDeviation="0.9" result="b" />
          <feMorphology in="d" operator="erode" radius="1.3" result="e" />
          <feComposite in="b" in2="e" operator="arithmetic" k1="0" k2="1.15" k3="-0.45" k4="0" result="edge" />
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="2" result="g" />
          <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.6 1.15" result="ga" />
          <feComposite in="edge" in2="ga" operator="in" />
        </filter>
        {s > 0 ? (
          <radialGradient id={`rb-rg-${s}`}>
            <stop offset=".45" stopColor={s === 3 ? "#E5484D" : s === 2 ? "#F2B705" : "#58AEFF"} stopOpacity={s === 3 ? ".5" : ".55"} />
            <stop offset="1" stopColor={s === 3 ? "#E5484D" : s === 2 ? "#F2B705" : "#58AEFF"} stopOpacity="0" />
          </radialGradient>
        ) : null}
      </defs>
      {s > 0 ? (
        <g className="bloom halo" filter="url(#rb-f-wc)">
          <circle cx="50" cy="52" r="46" fill={`url(#rb-rg-${s})`} />
        </g>
      ) : null}
      {s > 0 ? (
        <g className="bloom" filter="url(#rb-f-wc)">
          <path d={CLOUD} fill={tone} opacity={s === 1 ? 0.95 : 0.9} />
          {s >= 2 ? (
            <path
              d="M28 60C40 56 66 57 80 60"
              stroke={s === 3 ? "#252C44" : "#5C6886"}
              strokeWidth="7"
              fill="none"
              opacity=".6"
            />
          ) : null}
        </g>
      ) : null}
      <g className="wet">
        <path
          d={CLOUD}
          fill="none"
          style={{ stroke: "var(--rain-wc-line)" }}
          strokeWidth={s > 0 ? 1.3 : 3.4}
          strokeLinejoin="round"
          opacity={s > 0 ? 0.7 : 0.38}
          transform="translate(1 -1)"
          strokeDasharray={s > 0 ? undefined : "7 5.5"}
        />
      </g>
      <Drops stroke="var(--rain-wc-drop)" width={2.6} linecap="round" s={s} />
      {s === 3 ? (
        <g className="bolt">
          <g filter="url(#rb-f-wc)">
            <path d={BOLT} fill="#FFD866" />
          </g>
          <path d={BOLT} fill="none" style={{ stroke: "var(--rain-wc-line)" }} strokeWidth="1" opacity=".7" />
        </g>
      ) : null}
    </>
  );
}

function ink(s: RainState): IconDef["body"] {
  return (
    <>
      <defs>
        <filter id="rb-f-wob" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="9" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <pattern id="rb-i-hatch" width="4.5" height="4.5" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
          <path d="M0 0V4.5" style={{ stroke: "var(--rain-pen)" }} strokeWidth="1" opacity=".7" />
        </pattern>
        <pattern id="rb-i-hatch-x" width="4.5" height="4.5" patternUnits="userSpaceOnUse" patternTransform="rotate(-42)">
          <path d="M0 0V4.5" style={{ stroke: "var(--rain-pen)" }} strokeWidth="1" opacity=".6" />
        </pattern>
      </defs>
      <g filter="url(#rb-f-wob)">
        {s > 0 ? (
          <path
            className="draw halo"
            pathLength={1}
            d={rays(18, 40, 47, 0.6)}
            fill="none"
            style={{ stroke: "var(--rain-pen)" }}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {s >= 2 ? (
          <path d={CLOUD} fill="url(#rb-i-hatch)" opacity={s === 3 ? 1 : 0.75} />
        ) : null}
        {s === 3 ? <path d={CLOUD} fill="url(#rb-i-hatch-x)" /> : null}
        {s > 0 ? (
          <path
            className="draw"
            pathLength={1}
            d={CLOUD}
            fill="none"
            style={{ stroke: "var(--rain-pen)" }}
            strokeWidth={s === 3 ? 2.5 : 2.1}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d={CLOUD}
            fill="none"
            style={{ stroke: "var(--rain-pen)" }}
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeDasharray="5.5 6.8"
            opacity=".45"
          />
        )}
        <Drops stroke="var(--rain-pen)" width={2} linecap="round" s={s} />
        {s === 3 ? (
          <g className="bolt">
            <path d={BOLT} fill="#FFF3B0" style={{ stroke: "var(--rain-pen)" }} strokeWidth="1.8" strokeLinejoin="round" />
          </g>
        ) : null}
      </g>
    </>
  );
}

function rainDef(body: IconDef["body"]): IconDef {
  return { width: 30, height: 30, viewBox: "0 0 100 100", body };
}

export const RAIN_ICONS = {
  engraving: {
    "rain-off": rainDef(engraving(0)),
    "rain-drizzle": rainDef(engraving(1)),
    "rain-moderate": rainDef(engraving(2)),
    "rain-storm": rainDef(engraving(3)),
  },
  watercolor: {
    "rain-off": rainDef(watercolor(0)),
    "rain-drizzle": rainDef(watercolor(1)),
    "rain-moderate": rainDef(watercolor(2)),
    "rain-storm": rainDef(watercolor(3)),
  },
  ink: {
    "rain-off": rainDef(ink(0)),
    "rain-drizzle": rainDef(ink(1)),
    "rain-moderate": rainDef(ink(2)),
    "rain-storm": rainDef(ink(3)),
  },
} satisfies Partial<Record<SkinId, Record<RainIconName, IconDef>>>;
