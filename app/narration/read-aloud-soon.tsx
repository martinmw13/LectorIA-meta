// Read aloud for a book that has no narration yet: the same button in
// the same spot, greyed out and aria-disabled, with a small "Coming soon"
// note on hover, focus or click. It never starts audio.
"use client";

import { useId, useState } from "react";
import { heroArt } from "../skin-art";
import { useSkin } from "../use-skin";

export function ReadAloudSoon() {
  const art = heroArt(useSkin());
  const tipId = useId();
  const [open, setOpen] = useState(false);

  return (
    <div className="read-aloud read-aloud-soon" data-art="hero" data-open={open ? "1" : undefined}>
      <button
        type="button"
        className="read-aloud-btn"
        aria-disabled="true"
        aria-describedby={tipId}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        <span className="read-aloud-frame">
          <img className="read-aloud-art" src={art.narrate} alt="" width={40} height={40} />
        </span>
        <span className="read-aloud-label">Read aloud</span>
      </button>
      <span className="read-aloud-tip" role="tooltip" id={tipId}>
        Coming soon
      </span>
    </div>
  );
}
