// The illustration IS the button: a small skin-matched drawing plus
// an accent label. No border, no pill background. Motion only on
// hover (:hover) and press (:active); nothing loops at rest.
"use client";

import { useEffect, useRef, useState } from "react";
import { burst } from "../icons-rain-extra";
import { ButtonFx, pressButton } from "../button-fx";
import type { PictureSkin } from "./picture-skin";

const COMIC_POW = burst(12, 36, 48);

// One burst cycle: how long the overlay signature replays. Separate from
// data-press so a click replays even while the pointer hovers the button.
const BURST_MS = 1800;

function ButtonArt({ skin }: { skin: PictureSkin }) {
  if (skin === "pencil" || skin === "chihiro") {
    return (
      <svg viewBox="0 0 42 42" aria-hidden="true">
        <image className="pic-btn-paint" href={`/art/skins/${skin}/pic.png`} width="42" height="42" />
      </svg>
    );
  }
  if (skin === "comic") {
    const k = { stroke: "#14161C", strokeLinejoin: "round", strokeLinecap: "round" } as const;
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <path className="pic-btn-pow" d={COMIC_POW} fill="#9CC5FF" {...k} strokeWidth="2.2" />
        <circle cx="30" cy="32" r="10" fill="#FFE45C" {...k} strokeWidth="2.4" />
        <path d="M10 74C26 60 42 62 54 70S80 78 90 66" fill="none" {...k} strokeWidth="11" />
        <path
          className="paint"
          pathLength={1}
          d="M10 74C26 60 42 62 54 70S80 78 90 66"
          fill="none"
          stroke="#0866FF"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path d="M60 56L82 18C84 14 90 17 88 21L67 60Z" fill="#F29E4C" {...k} strokeWidth="2.6" />
        <path d="M60 56C53 58 52 66 45 71C56 73 65 69 67 60Z" fill="#14161C" />
      </svg>
    );
  }
  if (skin === "watercolor") {
    return (
      <svg viewBox="0 0 42 42" aria-hidden="true">
        <path
          className="pic-btn-blob"
          d="M6 24c0-9 9-14 17-12c8 1 14 6 12 13c-2 8-12 10-19 8c-6-1-10-4-10-9z"
          fill="#9FC4FF"
          opacity="0.7"
        />
        <path d="M16 29C15 24 17 19 22 16C27 19 28 24 16 29Z" fill="#0866FF" stroke="#1F2A44" strokeWidth="1" />
        <path d="M22 16L30 2" stroke="#1F2A44" strokeWidth="3.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (skin === "ink") {
    return (
      <svg viewBox="0 0 42 42" aria-hidden="true">
        <path d="M5 31c5-1 9-6 13-4s6 4 11 1" fill="none" stroke="#0866FF" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M6 12h22v14H6z" fill="none" stroke="#0866FF" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M8 24l6-6 4 4 3-3 6 5" fill="none" stroke="#0866FF" strokeWidth="1.4" />
        <circle cx="32" cy="11" r="2.4" fill="#0866FF" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 42 42" aria-hidden="true">
      <rect x="5" y="8" width="32" height="26" fill="#F7F1DE" stroke="#2A241C" strokeWidth="1.2" />
      <rect x="8" y="11" width="26" height="20" fill="none" stroke="#2A241C" strokeWidth="0.5" />
      <path d="M8 27l7-7 5 5 4-4 10 9" fill="none" stroke="#2A241C" strokeWidth="1" />
      {Array.from({ length: 5 }, (_, i) => (
        <path key={i} d={`M10 ${13 + i * 2.4}H32`} stroke="#2A241C" strokeWidth="0.4" opacity="0.6" />
      ))}
      <circle cx="28" cy="16" r="2.2" fill="#0866FF" />
      <g className="pic-btn-glint">
        <path d="M12 8L4 34" stroke="#FFFDF5" strokeWidth="3" opacity="0.8" />
      </g>
    </svg>
  );
}

export function PictureButton({
  skin,
  label,
  onClick,
}: {
  skin: PictureSkin;
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  // The click replays the one-shot press (classic skins) or POW (comic)
  // once, then rests still.
  const [press, setPress] = useState(false);
  // Burst counter: remounts the overlay (React key) so the click signature
  // restarts even when hover already plays the same element.
  const [burst, setBurst] = useState(0);
  const [burstOn, setBurstOn] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
      if (burstTimer.current) clearTimeout(burstTimer.current);
    },
    [],
  );

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    pressButton(e);
    setPress(true);
    setBurst((b) => b + 1);
    setBurstOn(true);
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => setPress(false), 400);
    if (burstTimer.current) clearTimeout(burstTimer.current);
    // Only the flag clears; the key stays so nothing remounts (replays) later.
    burstTimer.current = setTimeout(() => setBurstOn(false), BURST_MS);
    onClick(e);
  }

  return (
    <button
      type="button"
      className={`pic-btn pic-btn-${skin}`}
      data-picture-skin={skin}
      data-press={press ? "1" : undefined}
      data-burst={burstOn ? "1" : undefined}
      onClick={handleClick}
    >
      <span className="pic-btn-art" aria-hidden="true">
        <ButtonArt skin={skin} />
        <ButtonFx kind="picture" key={burst} />
      </span>
      <span className="pic-btn-lbl">{label}</span>
    </button>
  );
}
