"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cycleSkin, type SkinId } from "./skin";
import { useSkin } from "./use-skin";
import { Icon } from "./icons";
import "./style-stamp.css";

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

// Circular ex-libris stamp: the ring names the live style, a click cycles
// it through the skin owner, and a status pill confirms briefly.
export function StyleStamp({ size = "large" }: { size?: "large" | "small" }) {
  const skin = useSkin();
  const name = SKIN_NAMES[skin];
  const label = `Change style, now ${name}`;
  const [showNow, setShowNow] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const nowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Two stamps can share a page, so the ring path id is per instance.
  const pathId = `stamp-ring-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

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
      el.classList.remove("style-stamp-hit");
      void el.offsetWidth;
      el.classList.add("style-stamp-hit");
    }
    if (hitTimer.current) clearTimeout(hitTimer.current);
    hitTimer.current = setTimeout(() => buttonRef.current?.classList.remove("style-stamp-hit"), HIT_MS);
    setShowNow(true);
    if (nowTimer.current) clearTimeout(nowTimer.current);
    nowTimer.current = setTimeout(() => setShowNow(false), NOW_MS);
  }

  return (
    <div className={size === "small" ? "style-stamp-wrap style-stamp-wrap-small" : "style-stamp-wrap"}>
      <button
        ref={buttonRef}
        type="button"
        className="style-stamp"
        onClick={onClick}
        aria-label={label}
        title={label}
      >
        <span className="style-stamp-face" aria-hidden="true" />
        {size === "large" && (
          <svg className="style-stamp-ring" viewBox="0 0 104 104" aria-hidden="true" focusable="false">
            <defs>
              <path id={pathId} d="M52 14 a38 38 0 1 1 -0.01 0" />
            </defs>
            <text className="style-stamp-ringtxt">
              <textPath href={`#${pathId}`} startOffset="0" textLength={234} lengthAdjust="spacing">
                {`CHANGE STYLE \u2022 ${name.toUpperCase()} \u2022`}
              </textPath>
            </text>
          </svg>
        )}
        <span className="style-stamp-medal" aria-hidden="true">
          <Icon name="brush" size={size === "small" ? 18 : 30} />
        </span>
        <span className="style-stamp-inkring" aria-hidden="true" />
      </button>
      <p className={showNow ? "style-stamp-now style-stamp-show" : "style-stamp-now"} role="status" aria-live="polite">
        Now: <b>{name}</b>
      </p>
    </div>
  );
}
