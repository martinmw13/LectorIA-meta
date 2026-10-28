// Inline figures: the selection popover plus the figures rendered
// after their end paragraph. Click opens the lightbox.
"use client";

import { truncateCaption } from "./helpers";
import type { InlineFigure } from "./use-pictures";

function PictureIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.5" y="2.5" width="11" height="11" />
      <circle cx="6" cy="7" r="1.4" />
      <path d="M3.5 13 7 9.5l2.5 2.5 2-2 1 1" />
    </svg>
  );
}

export function SelectionPopover({
  pos,
  popRef,
  onPick,
}: {
  pos: { top: number; left: number };
  popRef: React.Ref<HTMLButtonElement>;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      ref={popRef}
      className="picture-float"
      style={{ top: pos.top, left: pos.left }}
      onClick={onPick}
      aria-label="Picture this"
    >
      <PictureIcon />
      Picture this
    </button>
  );
}

export function InlineFigureView({
  figure,
  onRemove,
  onRetry,
  onOpen,
  refCb,
}: {
  figure: InlineFigure;
  onRemove: () => void;
  onRetry: () => void;
  onOpen: (src: string, caption: string, opener: HTMLElement | null) => void;
  refCb: (el: HTMLElement | null) => void;
}) {
  if (figure.phase === "loading") {
    return (
      <figure className="genfig" data-fig={figure.id} ref={refCb as React.Ref<HTMLElement>}>
        <div className="genload" role="status">
          Sketching…
        </div>
      </figure>
    );
  }
  if (figure.phase === "error") {
    return (
      <figure className="genfig" data-fig={figure.id} ref={refCb as React.Ref<HTMLElement>}>
        <p className="gen-error" role="alert">
          {figure.message}{" "}
          <button type="button" className="retry-text" onClick={onRetry}>
            Try again
          </button>
        </p>
      </figure>
    );
  }
  if (!figure.url) return null;
  const url = figure.url;
  const captioned = `\u201C${truncateCaption(figure.quote)}\u201D`;
  return (
    <figure className="genfig" data-fig={figure.id} ref={refCb as React.Ref<HTMLElement>}>
      <img
        src={url}
        alt={captioned}
        tabIndex={0}
        onClick={(e) => onOpen(url, captioned, e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpen(url, captioned, e.currentTarget);
        }}
      />
      <figcaption>
        <span className="grow">{captioned}</span>
        <span className="gcredit">{figure.credit}</span>
        <button
          type="button"
          className="grm"
          onClick={onRemove}
          aria-label="Remove picture"
          title="Remove picture"
        >
          ×
        </button>
      </figcaption>
    </figure>
  );
}
