// Folio chrome: top line, resizable divider, bottom pager with ticks.
"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "../icons";
import { StyleStamp } from "../style-stamp";
import { clampSplitWidth, SPLIT_MIN_PX } from "./helpers";

export { THEME_KEY } from "../theme";
export const SPLIT_KEY = "lectoria.split";

export function TopLine({
  bookTitle,
  author,
  ch,
  chaptersTotal,
  chapters,
  onJumpChapter,
  theme,
  onToggleTheme,
}: {
  bookTitle: string;
  author: string;
  ch: number;
  chaptersTotal: number;
  chapters: { ch: number; title: string }[];
  onJumpChapter: (ch: number) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  return (
    <header className="top-line">
      <span className="wordmark">
        Lector<em>IA</em>
      </span>
      <div className="top-center">
        {bookTitle} · {author} ·{" "}
        <span className="chapter-jump">
          <span aria-hidden="true" className="chapter-jump-text">
            Chapter {ch} of {chaptersTotal}
          </span>
          <select value={ch} onChange={(e) => onJumpChapter(Number(e.target.value))} aria-label="Chapter">
            {chapters.map((c) => (
              <option key={c.ch} value={c.ch}>
                {c.ch}. {c.title}
              </option>
            ))}
          </select>
        </span>
      </div>
      <button
        type="button"
        className="theme-btn"
        onClick={onToggleTheme}
        aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
        aria-pressed={theme === "dark"}
        title={theme === "dark" ? "Light mode" : "Dark mode"}
      >
        {theme === "dark" ? <Icon name="sun" /> : <Icon name="moon" />}
      </button>
      <StyleStamp size="small" />
    </header>
  );
}

function defaultSplit(): number {
  if (typeof window === "undefined") return 320;
  return clampSplitWidth(Math.round(Math.min(1200, window.innerWidth - 80) * 0.3), window.innerWidth);
}

export function Divider() {
  const [width, setWidth] = useState(defaultSplit);
  const [viewport, setViewport] = useState(1280);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const measure = () => setViewport(window.innerWidth);
    measure();
    window.addEventListener("resize", measure);
    try {
      const saved = Number(window.localStorage.getItem(SPLIT_KEY));
      if (Number.isFinite(saved) && saved > 0) {
        setWidth(clampSplitWidth(saved, window.innerWidth));
        return () => window.removeEventListener("resize", measure);
      }
    } catch {
      // Fresh default below.
    }
    setWidth(defaultSplit());
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--pane-w", `${width}px`);
  }, [width]);

  function commit(next: number) {
    const clamped = clampSplitWidth(next, window.innerWidth);
    setWidth(clamped);
    try {
      window.localStorage.setItem(SPLIT_KEY, String(clamped));
    } catch {
      // Dragging still works for the session.
    }
  }

  return (
    <div
      ref={ref}
      className="pane-divider"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize image pane"
      aria-valuemin={SPLIT_MIN_PX}
      aria-valuemax={clampSplitWidth(Number.MAX_SAFE_INTEGER, viewport)}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize, double-click to reset"
      onDoubleClick={() => commit(defaultSplit())}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          commit(width - 16);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          commit(width + 16);
        }
      }}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        const move = (ev: PointerEvent) => {
          const grid = ref.current?.parentElement?.getBoundingClientRect();
          if (grid) commit(ev.clientX - grid.left);
        };
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
    >
      <span className="grip" aria-hidden="true">
        |
      </span>
    </div>
  );
}

export function BandPager({
  k,
  n,
  bookIndex,
  bookTotal,
  onPrev,
  onNext,
  atStart,
  atBookEnd,
}: {
  k: number;
  n: number;
  bookIndex: number;
  bookTotal: number;
  onPrev: () => void;
  onNext: () => void;
  atStart: boolean;
  atBookEnd: boolean;
}) {
  return (
    <div className="band-pager">
      <div className="pager-row">
        <button type="button" className="pager-btn" onClick={onPrev} disabled={atStart} aria-label="Previous page">
          ‹
        </button>
        <span className="pager-label">
          Scene {k} of {n}
        </span>
        <button type="button" className="pager-btn" onClick={onNext} disabled={atBookEnd} aria-label="Next page">
          ›
        </button>
      </div>
      <div className="ticks" aria-hidden="true">
        {Array.from({ length: bookTotal }, (_, i) => (
          <i key={i} className={i <= bookIndex ? "on" : ""} />
        ))}
      </div>
      <span className="tick-label">
        Scene {bookIndex + 1} of {bookTotal}
      </span>
    </div>
  );
}
