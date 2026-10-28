// Inline figures: the selection popover plus the figures rendered
// after their end paragraph. Click opens the lightbox.
"use client";

import { createPortal } from "react-dom";
import { truncateCaption } from "./helpers";
import { PICTURE_COPY, PictureIcon } from "./picture-copy";
import { PictureDraw, usePictureLoaded } from "./picture-draw";
import { usePictureSkin, usePictureSkinId } from "./picture-skin";
import type { InlineFigure } from "./use-pictures";

export function SelectionPopover({
  pos,
  popRef,
  onPick,
}: {
  pos: { top: number; left: number; hint?: string };
  popRef: React.Ref<HTMLButtonElement>;
  onPick: () => void;
}) {
  // Portalled to the body at document coordinates, so the pill stays on
  // the selection however the reader lays scenes out.
  if (typeof document === "undefined") return null;
  return createPortal(
    <button
      type="button"
      ref={popRef}
      className="picture-float"
      style={{ top: pos.top, left: pos.left }}
      onClick={onPick}
      aria-label={pos.hint ?? "Picture this"}
      aria-live="polite"
    >
      <PictureIcon size={12} />
      <span className="picture-float-lbl">{pos.hint ?? "Picture this"}</span>
    </button>,
    document.body,
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
  const skin = usePictureSkin();
  const skinId = usePictureSkinId();
  const { loaded, imgRef, markLoaded } = usePictureLoaded(
    figure.phase === "ready" && figure.url ? figure.url : "",
  );
  if (figure.phase === "loading") {
    return (
      <figure className="genfig" data-fig={figure.id} ref={refCb as React.Ref<HTMLElement>}>
        <div className="genload" role="status" data-picture-skin={skinId}>
          <PictureDraw skin={skin} />
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
            {PICTURE_COPY.retry}
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
      <div className="genload" data-picture-skin={skinId}>
        {loaded ? null : (
          <div className="pic-under">
            <PictureDraw skin={skin} frozen />
          </div>
        )}
        <img
          ref={imgRef}
          onLoad={markLoaded}
          onError={markLoaded}
          className={loaded ? `rv-${skin} gen-ready` : "gen-ready pic-waiting"}
          src={url}
          alt={captioned}
          loading="lazy"
          decoding="async"
          tabIndex={0}
        onClick={(e) => onOpen(url, captioned, e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpen(url, captioned, e.currentTarget);
        }}
        />
      </div>
      <figcaption>
        <span className="grow">{captioned}</span>
        <span className="gcredit">{figure.credit}</span>
        <button
          type="button"
          className="grm"
          onClick={onRemove}
          aria-label={PICTURE_COPY.remove}
          title={PICTURE_COPY.remove}
        >
          ×
        </button>
      </figcaption>
    </figure>
  );
}
