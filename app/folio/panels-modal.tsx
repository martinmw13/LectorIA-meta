// Chapter panels: the comic-page modal, opened on demand from the pane. Port of the .proto/v3 panels look, not its code.
"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "../icons";
import type { ChapterPanel } from "./panels";
import { getCachedScenePicture } from "./use-pictures";

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
      opener?.focus?.({ preventScroll: true });
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
                <img src={p.url} alt="" loading="lazy" decoding="async" />
                <span className="panel-cap">{p.caption}</span>
              </button>
            ) : (
              <div key={p.sceneId} className="panel bare" aria-label={`Panel ${i + 1}: ${p.caption}`}>
                <span className="panel-num" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="panel-hatch" aria-hidden="true">
                  <Icon name="pencil" />
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
