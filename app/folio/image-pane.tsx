// Left image pane: placeholder, loading shimmer, revealed image with
// hover expand, error with retry. Click opens the lightbox.
"use client";

import { useRef, useState } from "react";
import type { SceneCard } from "./use-pictures";

function PictureIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.5" y="2.5" width="11" height="11" />
      <circle cx="6" cy="7" r="1.4" />
      <path d="M3.5 13 7 9.5l2.5 2.5 2-2 1 1" />
    </svg>
  );
}

export function ImagePane({
  card,
  onPicture,
  onRetry,
  onClear,
  onOpen,
}: {
  card: SceneCard;
  onPicture: () => void;
  onRetry: () => void;
  onClear: () => void;
  onOpen: (src: string, caption: string, opener: HTMLElement | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const timer = useRef<number | null>(null);

  function armExpand() {
    if (timer.current !== null) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setExpanded(true);
    }, 250);
  }

  function cancelExpand() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setExpanded(false);
  }

  return (
    <section className="img-pane" aria-label="Illustration">
      <div className="frame">
        {card.phase === "idle" ? (
          <>
            <div className="paper-grain" aria-hidden="true">
              <span className="blob b1" />
              <span className="blob b2" />
              <span className="blob b3" />
              <span className="grain" />
            </div>
            <button type="button" className="pic-pill" onClick={onPicture}>
              <PictureIcon />
              Picture this scene
            </button>
          </>
        ) : card.phase === "loading" ? (
          <div className="pane-loading" role="status">
            Sketching…
          </div>
        ) : card.phase === "ready" ? (
          <>
            <img
              className="pane-img"
              src={card.url}
              alt={card.caption}
              tabIndex={0}
              onMouseEnter={armExpand}
              onMouseLeave={cancelExpand}
              onFocus={cancelExpand}
              onClick={(e) => {
                cancelExpand();
                onOpen(card.url, card.caption, e.currentTarget);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") onOpen(card.url, card.caption, e.currentTarget);
              }}
            />
            {expanded ? (
              <>
                <div className="expand-dim" aria-hidden="true" />
                <img
                  className="expand-img"
                  src={card.url}
                  alt=""
                  onMouseLeave={cancelExpand}
                  onClick={() => {
                    cancelExpand();
                    onOpen(card.url, card.caption, null);
                  }}
                />
              </>
            ) : null}
          </>
        ) : (
          <div className="pane-error" role="alert">
            <p>{card.message}</p>
            <button type="button" className="retry-text" onClick={onRetry}>
              Try again
            </button>
          </div>
        )}
      </div>
      {card.phase === "ready" ? (
        <div className="pane-cap">
          <span className="pane-cap-text">{card.caption}</span>
          <button
            type="button"
            className="pane-x"
            onClick={onClear}
            aria-label="Remove picture"
            title="Remove picture"
          >
            ×
          </button>
        </div>
      ) : null}
    </section>
  );
}
