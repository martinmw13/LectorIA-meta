// Read-sync: a requestAnimationFrame loop follows audio.currentTime
// through the manifest (surviving seek, pause, and rate changes because
// it never keeps its own clock), maps words onto the rendered
// fragments, and turns the sub-page automatically unless the reader
// just moved by hand.
"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { activeChunkAt, activeWordAt, wordAt, type ChapterNarration } from "@/core/narration";
import { Icon } from "../icons";
import { highlightStyleFor, type HighlightTreatment } from "./highlight-style";
import { rangesForChunk } from "./ranges";
import { shouldAutoTurn } from "./turn";

export interface SyncFragment {
  id: string;
  n: number;
  text: string;
  from?: number;
}

export interface MarkRect {
  left: number;
  top: number;
  width: number;
  height: number;
  word: string;
}

interface ActiveSpot {
  chunk: number;
  word: number;
}

const SENTENCE_HIGHLIGHT = "narration-sentence";

function skinTreatment(): HighlightTreatment {
  try {
    return highlightStyleFor(document.documentElement.dataset.skin ?? "default");
  } catch {
    return "engraving";
  }
}

function reducedMotion(): boolean {
  try {
    return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function useReadSync(opts: {
  enabled: boolean;
  audioRef: RefObject<HTMLAudioElement | null>;
  manifest: ChapterNarration | null;
  span: { startSec: number; endSec: number } | null;
  containerRef: RefObject<HTMLElement | null>;
  scrollerRef: RefObject<HTMLElement | null>;
  pages: { paragraphs: SyncFragment[] }[];
  textPage: number;
  onTurnPage: (textIndex: number) => void;
  lastManualRef: RefObject<number | null>;
}): { mark: MarkRect | null; treatment: HighlightTreatment } {
  const [treatment] = useState<HighlightTreatment>(skinTreatment);
  const [mark, setMark] = useState<MarkRect | null>(null);
  const [active, setActive] = useState<ActiveSpot | null>(null);

  const live = useRef(opts);
  live.current = opts;

  // The follow loop: audio time in, chunk/word out, one auto-turn gate.
  useEffect(() => {
    const { enabled, audioRef, manifest, span } = live.current;
    if (!enabled || !manifest) {
      setActive(null);
      return;
    }
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const audio = audioRef.current;
      if (!audio || audio.paused) return;
      const t = audio.currentTime;
      if (span !== null && (t < span.startSec - 0.3 || t > span.endSec + 2)) return;
      const ci = activeChunkAt(manifest.chunks, t);
      if (ci < 0) {
        setActive((prev) => (prev === null ? prev : null));
        return;
      }
      const chunk = manifest.chunks[ci] as ChapterNarration["chunks"][number];
      const wi = activeWordAt(chunk, t);
      setActive((prev) => (prev !== null && prev.chunk === ci && prev.word === wi ? prev : { chunk: ci, word: wi }));
      const { pages, textPage, onTurnPage, lastManualRef } = live.current;
      const at = pages.findIndex((pg) => pg.paragraphs.some((p) => p.n === chunk.n));
      if (at >= 0 && at !== textPage && shouldAutoTurn(lastManualRef.current, performance.now())) {
        onTurnPage(at);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [opts.enabled, opts.manifest]);

  // Measure the active word against the fragment DOM and paint the
  // sentence tint through the Highlight API (no-op where unsupported).
  useLayoutEffect(() => {
    const { containerRef, scrollerRef, manifest } = live.current;
    const container = containerRef.current;
    clearSentence();
    if (!container || !manifest || active === null) {
      setMark(null);
      return;
    }
    const chunk = manifest.chunks[active.chunk];
    if (!chunk) {
      setMark(null);
      return;
    }
    const { word: wordRange, wordText, sentence } = rangesForChunk(container, chunk, active.word);
    paintSentence(sentence);
    if (!wordRange) {
      setMark(null);
      return;
    }
    const rects = (wordRange as Range).getClientRects();
    if (rects.length === 0) {
      setMark(null);
      return;
    }
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const r of rects) {
      left = Math.min(left, r.left);
      top = Math.min(top, r.top);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    }
    const box = container.getBoundingClientRect();
    let padX = 0;
    let padY = 0;
    if (treatment === "ink-doodle") {
      padX = 6;
      padY = 3;
    } else if (treatment === "watercolor") {
      padX = 3;
    }
    setMark({
      left: left - box.left - padX,
      top: top - box.top - padY,
      width: right - left + padX * 2,
      height: bottom - top + padY * 2,
      word: wordText,
    });
    const scroller = scrollerRef.current;
    if (scroller && rects[0]) {
      const view = scroller.getBoundingClientRect();
      const first = rects[0];
      const margin = 8;
      if (first.top < view.top + margin || first.bottom > view.bottom - margin) {
        try {
          scroller.scrollTo({
            top: scroller.scrollTop + (first.top - view.top) - view.height * 0.3,
            behavior: reducedMotion() ? "auto" : "smooth",
          });
        } catch {
          // The column keeps native scroll; the mark follows anyway.
        }
      }
    }
  }, [active, opts.manifest, treatment]);

  // Click a word to seek there, only while narration runs.
  useEffect(() => {
    const { enabled, containerRef, audioRef } = live.current;
    const container = containerRef.current;
    if (!enabled || !container) return;
    const onClick = (event: MouseEvent) => {
      const audio = audioRef.current;
      const heard = live.current.manifest;
      if (!audio || !heard) return;
      const doc = container.ownerDocument;
      const atPoint = doc.caretRangeFromPoint?.bind(doc);
      const range = atPoint ? atPoint(event.clientX, event.clientY) : null;
      if (!range || range.startContainer.nodeType !== 3) return;
      const p = (range.startContainer.parentElement as Element | null)?.closest?.("p[data-n]");
      if (!p || !container.contains(p)) return;
      const n = Number(p.getAttribute("data-n"));
      const from = Number(p.getAttribute("data-from") ?? 0);
      if (!Number.isInteger(n)) return;
      const hit = wordAt({ chunks: heard.chunks }, n, from + range.startOffset);
      if (hit) {
        try {
          audio.currentTime = hit.t0 + 0.001;
        } catch {
          // Past the end; the watchdog advances on timeupdate.
        }
      }
    };
    container.addEventListener("click", onClick);
    return () => container.removeEventListener("click", onClick);
  }, [opts.enabled, opts.manifest]);

  return { mark, treatment };
}

// Sentence tint helpers: the CSS Custom Highlight API with a no-op
// fallback where unsupported.
function clearSentence() {
  try {
    const css = CSS as unknown as { highlights?: { delete(name: string): void } };
    css.highlights?.delete(SENTENCE_HIGHLIGHT);
  } catch {
    // Unsupported browsers simply skip the tint.
  }
}

function paintSentence(ranges: Range[]) {
  try {
    const css = CSS as unknown as { highlights?: { set(name: string, highlight: unknown): void } };
    const Ctor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    if (css.highlights && Ctor && ranges.length > 0) {
      css.highlights.set(SENTENCE_HIGHLIGHT, new Ctor(...ranges));
    }
  } catch {
    // Unsupported browsers simply skip the tint.
  }
}

export function ReadMark({ mark, treatment }: { mark: MarkRect | null; treatment: HighlightTreatment }) {
  if (!mark) return null;
  const style = { left: mark.left, top: mark.top, width: mark.width, height: mark.height };
  if (treatment === "ink-doodle") {
    return (
      <span className="narr-mark" data-treatment="ink-doodle" style={style} aria-hidden="true">
        <Icon name="ink-circle" preserveAspectRatio="none" />
      </span>
    );
  }
  if (treatment === "watercolor") {
    return <span className="narr-mark" data-treatment="watercolor" style={style} aria-hidden="true" />;
  }
  return (
    <span className="narr-mark" data-treatment="engraving" style={style} aria-hidden="true">
      <span className="narr-word">{mark.word}</span>
    </span>
  );
}
