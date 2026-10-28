// Inline figures: the selection popover plus the figures rendered
// after their end paragraph. Click opens the lightbox.
"use client";

import { truncateCaption } from "./helpers";
import { PICTURE_COPY, PictureIcon } from "./picture-copy";
import { PictureDraw, usePictureLoaded } from "./picture-draw";
import { usePictureSkin } from "./picture-skin";
import type { InlineFigure } from "./use-pictures";

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
      <PictureIcon size={12} />
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
  const skin = usePictureSkin();
  const { loaded, imgRef, markLoaded } = usePictureLoaded(
    figure.phase === "ready" && figure.url ? figure.url : "",
  );
  if (figure.phase === "loading") {
    return (
      <figure className="genfig" data-fig={figure.id} ref={refCb as React.Ref<HTMLElement>}>
        <div className="genload" role="status">
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
      <div className="genload">
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
