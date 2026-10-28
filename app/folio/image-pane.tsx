// Left image pane: placeholder, loading shimmer, revealed image with
// hover expand, error with retry. Click opens the lightbox.
"use client";

import { useRef, useState } from "react";
import { PICTURE_COPY, PictureIcon } from "./picture-copy";
import type { SceneCard } from "./use-pictures";

export function ImagePane({
  card,
  onPicture,
  onRetry,
  onClear,
  onOpen,
  bare,
  onPictureChapter,
}: {
  card: SceneCard;
  onPicture: () => void;
  onRetry: () => void;
  onClear: () => void;
  onOpen: (src: string, caption: string, opener: HTMLElement | null) => void;
  // The cover shows the placeholder with no pill: nothing to picture yet.
  bare?: boolean;
  // On text pages the pill pairs the scene action with the chapter one.
  onPictureChapter?: ((opener: HTMLElement | null) => void) | null;
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
            {bare ? null : onPictureChapter ? (
              <span className="pic-pair" role="group" aria-label="Picture choices">
                <button type="button" className="pic-half" onClick={onPicture}>
                  <PictureIcon />
                  Picture this scene
                </button>
                <button type="button" className="pic-half" onClick={(e) => onPictureChapter(e.currentTarget)}>
                  Picture the chapter
                </button>
              </span>
            ) : (
              <button type="button" className="pic-pill" onClick={onPicture}>
                <PictureIcon />
                Picture this scene
              </button>
            )}
          </>
        ) : card.phase === "loading" ? (
          <div className="pane-loading" role="status">
            {PICTURE_COPY.loading}
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
              {PICTURE_COPY.retry}
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
            aria-label={PICTURE_COPY.remove}
            title={PICTURE_COPY.remove}
          >
            ×
          </button>
        </div>
      ) : null}
      {card.phase === "ready" && onPictureChapter ? (
        <button type="button" className="pane-chapter" onClick={(e) => onPictureChapter(e.currentTarget)}>
          Picture the chapter
        </button>
      ) : null}
    </section>
  );
}
