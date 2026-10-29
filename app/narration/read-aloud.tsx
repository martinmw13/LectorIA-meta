// The read-aloud control: play/pause plus a narration-only volume
// slider. Light mode is the default; colours come from tokens.
"use client";

import { useEffect, useRef, useState } from "react";
import { heroArt } from "../skin-art";
import { useSkin } from "../use-skin";
import { ButtonFx } from "../button-fx";
import { useNarration } from "./context";

// One face-in cycle: how long the button replays its change animation
// after a toggle, matching the longest per-skin face-in.
const ANIM_MS = 600;

export function ReadAloud() {
  const { on, status, playing, volume, toggle, setVolume } = useNarration();
  const busy = on && status !== "ready" && status !== "error";
  const label = !on ? "Read aloud" : playing ? "Pause" : "Read aloud";
  const art = heroArt(useSkin());
  // The toggle flips state, so it replays the one-shot face-in once.
  const [anim, setAnim] = useState(false);
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (animTimer.current) clearTimeout(animTimer.current);
    },
    [],
  );

  function onToggle() {
    toggle();
    setAnim(true);
    if (animTimer.current) clearTimeout(animTimer.current);
    animTimer.current = setTimeout(() => setAnim(false), ANIM_MS);
  }

  return (
    <div className="read-aloud" data-state={status} data-on={on} data-art="hero">
      <button
        type="button"
        className="read-aloud-btn"
        data-anim={anim ? "1" : undefined}
        onClick={onToggle}
        aria-pressed={on && playing}
        aria-label={label}
        title={label}
      >
        <span className="read-aloud-frame">
          <img className="read-aloud-art" src={art.narrate} alt="" width={40} height={40} />
          <ButtonFx kind="narrate" />
        </span>
        <span className="read-aloud-label">{label}</span>
      </button>
      <label className="read-aloud-volume">
        <span className="sr-only">Narration volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="Narration volume"
        />
      </label>
      {on && status === "loading" ? <p className="read-aloud-note">Getting the voice ready…</p> : null}
      {on && status === "error" ? (
        <p className="read-aloud-note" role="alert">
          The voice isn&apos;t available right now.
        </p>
      ) : null}
      {busy ? <span className="sr-only" aria-live="polite">Getting the voice ready…</span> : null}
    </div>
  );
}
