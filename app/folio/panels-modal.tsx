// Chapter panels: the offer card on the cover, the spoiler gate, and
// the comic-page modal. Port of the .proto/v3 panels look, not its code.
"use client";

import { useEffect, useRef, useState } from "react";
import { PANELS_NAME } from "./panels";
import type { ChapterPanel } from "./panels";
import { getCachedScenePicture } from "./use-pictures";

export const SPOILER_LINE = "The whole chapter, told in pictures. It gives away what happens, so you may want to read first.";

function EyeOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 2.5l11 11M6.6 3.2c.5-.1 1-.2 1.4-.2 2.8 0 5.2 2.4 6 5-1 3.2-3.2 5-6 5-1 0-2-.3-2.8-.7M4 4.6C2.7 5.7 2 7 2 8c.8 2.6 3.2 5 6 5 1 0 2-.3 2.9-.8" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M11.5 2.5l2 2L5 13l-2.7.7L3 11l8.5-8.5Z" />
    </svg>
  );
}

// Blurred strip of the chapter's thumbs: spoiler-safe, decorative only.
export function BlurredThumbs({ panels, unblurredCount }: { panels: ChapterPanel[]; unblurredCount?: number }) {
  const show = unblurredCount === undefined ? panels : panels.slice(0, unblurredCount);
  return (
    <div className={unblurredCount === undefined ? "thumb-strip" : "thumb-strip open"} aria-hidden="true">
      {show.map((p) => (
        <span key={p.sceneId} className="thumb-tile">
          {p.art ? <img src={p.art} alt="" /> : <span className="thumb-empty" />}
        </span>
      ))}
    </div>
  );
}

export function PanelsOfferCard({ panels, onShowAnyway, onReadFirst }: { panels: ChapterPanel[]; onShowAnyway: () => void; onReadFirst: () => void }) {
  return (
    <section className="panels-offer" aria-label={PANELS_NAME}>
      <BlurredThumbs panels={panels} />
      <div className="panels-offer-row">
        <span className="panels-eye">
          <EyeOffIcon />
        </span>
        <div>
          <p className="panels-name">{PANELS_NAME}</p>
          <p className="panels-spoiler">{SPOILER_LINE}</p>
        </div>
      </div>
      <div className="panels-btns">
        <button type="button" className="panels-primary" onClick={onShowAnyway}>
          Show me anyway
        </button>
        <button type="button" className="panels-quiet" onClick={onReadFirst}>
          I&apos;ll read first
        </button>
      </div>
    </section>
  );
}

export function PanelsQuietLink({ onOpen }: { onOpen: (opener: HTMLElement | null) => void }) {
  return (
    <button type="button" className="panels-link" onClick={(e) => onOpen(e.currentTarget)}>
      {PANELS_NAME}
    </button>
  );
}

// Small gate in front of the panels: the spoiler line plus a choice.
// It never repeats the panels name.
export function SpoilerGateDialog({ onShow, onNotYet }: { onShow: () => void; onNotYet: () => void }) {
  const showRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    showRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onNotYet();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onNotYet]);
  return (
    <div className="gate-wrap" role="dialog" aria-modal="true" aria-label="Before you look ahead">
      <div className="gate-card">
        <p>{SPOILER_LINE}</p>
        <div className="panels-btns">
          <button ref={showRef} type="button" className="panels-primary" onClick={onShow}>
            Show me anyway
          </button>
          <button type="button" className="panels-quiet" onClick={onNotYet}>
            Not yet
          </button>
        </div>
      </div>
    </div>
  );
}

interface ResolvedPanel extends ChapterPanel {
  url: string | null;
}

export function PanelsModal({
  ch,
  chapterTitle,
  panels,
  onClose,
  onOpenArt,
}: {
  ch: number;
  chapterTitle: string;
  panels: ChapterPanel[];
  onClose: () => void;
  onOpenArt: (src: string, caption: string, opener: HTMLElement | null) => void;
}) {
  const chapterLabel = `Chapter ${ch}, ${chapterTitle}`;
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  // Session cache first, bundled art next, placeholder last.
  const [resolved] = useState<ResolvedPanel[]>(() =>
    panels.map((p) => ({ ...p, url: getCachedScenePicture(p.sceneId)?.url ?? p.art })),
  );

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // The shared lightbox sits above the modal and closes itself.
        if (document.querySelector(".lightbox")) return;
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !boxRef.current) return;
      const items = [...boxRef.current.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])")].filter(
        (el) => !el.hasAttribute("disabled"),
      );
      if (items.length === 0) return;
      const first = items[0] as HTMLElement;
      const last = items[items.length - 1] as HTMLElement;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="panels-modal" role="dialog" aria-modal="true" aria-label={chapterLabel}>
      <div ref={boxRef} className="panels-box">
        <button ref={closeRef} type="button" className="panels-x" onClick={onClose} aria-label="Close">
          ×
        </button>
        <p className="panels-head">
          Chapter {ch} · {chapterTitle}
        </p>
        <div className={resolved.length <= 4 ? "panel-grid two" : "panel-grid"}>
          {resolved.map((p, i) =>
            p.url ? (
              <button
                key={p.sceneId}
                type="button"
                className="panel"
                onClick={(e) => onOpenArt(p.url as string, p.caption, e.currentTarget)}
                aria-label={`Panel ${i + 1}: ${p.caption}`}
              >
                <span className="panel-num" aria-hidden="true">
                  {i + 1}
                </span>
                <img src={p.url} alt="" />
                <span className="panel-cap">{p.caption}</span>
              </button>
            ) : (
              <div key={p.sceneId} className="panel bare" aria-label={`Panel ${i + 1}: ${p.caption}`}>
                <span className="panel-num" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="panel-hatch" aria-hidden="true">
                  <PencilIcon />
                </span>
                <span className="panel-cap">{p.caption}</span>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
