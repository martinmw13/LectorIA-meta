// Shared one-shot particle overlay for the pencil and chihiro art buttons.
// Markup is verbatim from the approved prototypes (pencil-app-fx.js):
// per-kind particles (drops/glints for rain, notes for music, wave2 for
// narrate, paint stroke for picture) plus the theme extra on every art
// button (CRUMBS ellipse glints for pencil, 5 fly groups for chihiro).
// Rendered only for pencil/chihiro; null anywhere else. Still at rest:
// particles sit at opacity 0 until :hover or the change flag plays them.
"use client";

import type { CSSProperties } from "react";
import { useSkin } from "./use-skin";

export type ButtonFxKind = "rain" | "music" | "narrate" | "picture";
export type RainFxLevel = 0 | 1 | 2 | 3;

const RAIN_DROP_COUNT = [0, 5, 8, 12];
const OFF_GLINTS: Array<[number, number, number]> = [
  [100, 28, 7],
  [112, 50, 4],
];
const NOTES: Array<[number, number, number]> = [
  [96, 40, 0],
  [108, 62, 1],
  [30, 34, 2],
];
const CRUMBS: Array<[number, number, number, number]> = [
  [26, 104, 3, 0],
  [112, 100, 2.4, 1],
  [118, 34, 2, 2],
  [20, 40, 2.2, 3],
];
const FLIES: Array<[number, number, number, number, number]> = [
  [30, 40, -6, -8, 0],
  [106, 36, 6, -9, 1],
  [114, 92, 7, -4, 2],
  [24, 100, -7, -5, 3],
  [70, 20, 2, -8, 4],
];
const NARR_WAVES = [
  "M100 56c5 6 5 18 0 24",
  "M108 48c9 10 9 30 0 40",
  "M116 40c12 14 12 42 0 56",
];

function glintPath(x: number, y: number, r: number): string {
  return (
    `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}` +
    `Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}` +
    `Q${x} ${y} ${x} ${y - r}Z`
  );
}

function RainFx({ level }: { level: RainFxLevel }) {
  if (level === 0) {
    return (
      <>
        {OFF_GLINTS.map(([x, y, r], i) => (
          <path
            key={i}
            className="glint"
            style={{ "--i": i } as CSSProperties}
            d={glintPath(x, y, r)}
            fill="#FFD45C"
          />
        ))}
      </>
    );
  }
  return (
    <>
      {Array.from({ length: RAIN_DROP_COUNT[level] ?? 0 }, (_, i) => {
        const x = 34 + ((i * 29) % 70);
        const y = 96 + ((i * 13) % 14);
        return (
          <path
            key={i}
            className="drop"
            style={{ "--i": i } as CSSProperties}
            d={`M${x} ${y}l-3 9`}
            stroke="#55595F"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        );
      })}
    </>
  );
}

function MusicFx() {
  return (
    <>
      {NOTES.map(([x, y, i]) => (
        <g key={i} className="note" style={{ "--i": i } as CSSProperties}>
          <path
            d={`M${x} ${y}v-14l9-3v14`}
            fill="none"
            stroke="#0866FF"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <ellipse cx={x - 3} cy={y} rx="4" ry="3" fill="#0866FF" />
          <ellipse cx={x + 6} cy={y - 3} rx="4" ry="3" fill="#0866FF" />
        </g>
      ))}
    </>
  );
}

function NarrateFx() {
  return (
    <>
      {NARR_WAVES.map((d, i) => (
        <path
          key={i}
          className="wave2"
          style={{ "--i": i } as CSSProperties}
          d={d}
          fill="none"
          stroke="#0866FF"
          strokeWidth="3"
          strokeLinecap="round"
        />
      ))}
    </>
  );
}

function PictureFx() {
  return (
    <path
      className="stroke"
      pathLength={1}
      d="M18 112C40 98 62 104 80 110S112 116 124 100"
      fill="none"
      stroke="var(--color-accent)"
      strokeWidth="3"
      strokeLinecap="round"
      opacity=".8"
    />
  );
}

function ThemeFx({ theme }: { theme: "pencil" | "chihiro" }) {
  if (theme === "pencil") {
    return (
      <>
        {CRUMBS.map(([x, y, r, i]) => (
          <ellipse
            key={i}
            className="glint"
            style={{ "--i": i } as CSSProperties}
            cx={x}
            cy={y}
            rx={r * 1.5}
            ry={r}
            fill="#B9BCC1"
          />
        ))}
      </>
    );
  }
  return (
    <>
      {/* Clear-day gusts, verbatim from the approved prototype: two wind
          strokes plus the red leaf. The lantern fireflies stay too. */}
      <path
        className="gust"
        style={{ "--i": 0 } as CSSProperties}
        pathLength="1"
        d="M4 44c18-10 34 4 52-2s26-12 38-4"
        fill="none"
        stroke="#7CC6BA"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        className="gust"
        style={{ "--i": 1 } as CSSProperties}
        pathLength="1"
        d="M20 62c14-6 26 2 40 0s22-8 30-2"
        fill="none"
        stroke="#A9D8F2"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        className="glint"
        style={{ "--i": 2 } as CSSProperties}
        d="M118 26c3 4 8 4 10 0-4-1-7 1-10 0z"
        fill="#D2452E"
      />
      {FLIES.map(([x, y, dx, dy, i]) => (
        <g
          key={i}
          className="fly"
          style={{ "--i": i, "--dx": `${dx}px`, "--dy": `${dy}px` } as CSSProperties}
        >
          <circle cx={x} cy={y} r="6" fill="#FFC25A" opacity=".35" />
          <circle cx={x} cy={y} r="2.4" fill={i % 2 ? "#E2563A" : "#F2B23C"} />
        </g>
      ))}
    </>
  );
}

export function ButtonFx({
  kind,
  level = 0,
  on = false,
}: {
  kind: ButtonFxKind;
  level?: RainFxLevel;
  on?: boolean;
}) {
  const skin = useSkin();
  if (skin !== "pencil" && skin !== "chihiro") return null;
  // While narration is on, a second persistent waves overlay sits over the
  // book (prototype art('narr', s)): still at rest, wave2in plays on the
  // change flag, hidden when off. The hover .wave2 particles stay as-is.
  const waves = kind === "narrate" && on;
  return (
    <>
      <svg className="fx" viewBox="0 0 136 136" aria-hidden="true">
        {kind === "rain" ? <RainFx level={level} /> : null}
        {kind === "music" ? <MusicFx /> : null}
        {kind === "narrate" ? <NarrateFx /> : null}
        {kind === "picture" ? <PictureFx /> : null}
        <ThemeFx theme={skin} />
      </svg>
      {waves ? (
        <svg className="fx waves" viewBox="0 0 136 136" aria-hidden="true">
          {NARR_WAVES.map((d, i) => (
            <path
              key={i}
              style={{ "--i": i } as CSSProperties}
              d={d}
              fill="none"
              stroke="#0866FF"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
          ))}
        </svg>
      ) : null}
    </>
  );
}

// One-shot press for boxless icon and picture buttons: sets a short-lived
// flag the motion CSS animates once, then clears it. No state, no re-render.
export function pressButton(e: React.MouseEvent<HTMLButtonElement>, ms = 380): void {
  const el = e.currentTarget;
  el.dataset.press = "1";
  window.setTimeout(() => {
    delete el.dataset.press;
  }, ms);
}
