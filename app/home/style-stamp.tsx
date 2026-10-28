"use client";

import { useEffect, useRef, useState } from "react";
import { cycleSkin, type SkinId } from "../skin";
import { useSkin } from "../use-skin";
import { HomeIcon } from "./home-icons";

export const SKIN_NAMES: Record<SkinId, string> = {
  engraving: "Engraving",
  watercolor: "Watercolor",
  ink: "Ink doodle",
  pencil: "Pencil",
  comic: "Comic book",
  chihiro: "Chihiro",
};

const NOW_MS = 1800;
const HIT_MS = 600;

// Circular ex-libris stamp: the ring names the live style, a click
// cycles it through the skin owner, and a status pill confirms briefly.
export function StyleStamp() {
  const skin = useSkin();
  const name = SKIN_NAMES[skin];
  const [showNow, setShowNow] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const nowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (nowTimer.current) clearTimeout(nowTimer.current);
      if (hitTimer.current) clearTimeout(hitTimer.current);
    },
    [],
  );

  function onClick() {
    cycleSkin();
    const el = buttonRef.current;
    if (el) {
      el.classList.remove("ob-hit");
      void el.offsetWidth;
      el.classList.add("ob-hit");
    }
    if (hitTimer.current) clearTimeout(hitTimer.current);
    hitTimer.current = setTimeout(() => buttonRef.current?.classList.remove("ob-hit"), HIT_MS);
    setShowNow(true);
    if (nowTimer.current) clearTimeout(nowTimer.current);
    nowTimer.current = setTimeout(() => setShowNow(false), NOW_MS);
  }

  return (
    <div className="ob-stampwrap">
      <button ref={buttonRef} type="button" className="ob-stamp" onClick={onClick} aria-label={`Change style, now ${name}`}>
        <span className="ob-face" aria-hidden="true" />
        <svg className="ob-ring" viewBox="0 0 104 104" aria-hidden="true" focusable="false">
          <defs>
            <path id="obTop" d="M52 14 a38 38 0 1 1 -0.01 0" />
          </defs>
          <text className="ob-ringtxt">
            <textPath href="#obTop" startOffset="0" textLength={234} lengthAdjust="spacing">
              {`CHANGE STYLE \u2022 ${name.toUpperCase()} \u2022`}
            </textPath>
          </text>
        </svg>
        <span className="ob-medal" aria-hidden="true">
          <HomeIcon name="brush" />
        </span>
        <span className="ob-inkring" aria-hidden="true" />
      </button>
      <p className={showNow ? "ob-now ob-show" : "ob-now"} role="status" aria-live="polite">
        Now: <b>{name}</b>
      </p>
    </div>
  );
}
