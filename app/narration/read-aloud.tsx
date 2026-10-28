// The read-aloud control: play/pause plus a narration-only volume
// slider. Light mode is the default; colours come from tokens.
"use client";

import { Icon } from "../icons";
import { heroArt } from "../skin-art";
import { useSkin } from "../use-skin";
import { useNarration } from "./context";

export function ReadAloud() {
  const { on, status, playing, volume, toggle, setVolume } = useNarration();
  const busy = on && status !== "ready" && status !== "error";
  const label = !on ? "Read aloud" : playing ? "Pause" : "Read aloud";
  const art = heroArt(useSkin());
  return (
    <div className="read-aloud" data-state={status} data-on={on} data-art={art ? "hero" : undefined}>
      <button
        type="button"
        className="read-aloud-btn"
        onClick={toggle}
        aria-pressed={on && playing}
        aria-label={label}
        title={label}
      >
        {art ? (
          <img className="read-aloud-art" src={art.narrate} alt="" width={40} height={40} />
        ) : (
          <Icon name="read-aloud" />
        )}
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
