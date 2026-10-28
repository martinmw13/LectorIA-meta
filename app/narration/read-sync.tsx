// Read-sync: a requestAnimationFrame loop follows audio.currentTime
// through the manifest (surviving seek, pause, and rate changes because
// it never keeps its own clock) and maps words onto the whole
// paragraphs in the reading column. The spoken paragraph is brought in
// with followIntoView; within 4 s of a hand move the voice keeps
// reading but the mark hides instead of yanking the reader back.
"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { activeChunkAt, activeWordAt, wordAt, type ChapterNarration } from "@/core/narration";
import { followIntoView } from "../leer/scroll-helpers";
import { Icon } from "../icons";
import { engravingScale, highlightStyleFor, type HighlightTreatment } from "./highlight-style";
import { rangesForChunk } from "./ranges";

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

export function useReadSync(opts: {
  enabled: boolean;
  audioRef: RefObject<HTMLAudioElement | null>;
  manifest: ChapterNarration | null;
  span: { startSec: number; endSec: number } | null;
  columnRef: RefObject<HTMLElement | null>;
}): { mark: MarkRect | null; treatment: HighlightTreatment } {
  const [treatment, setTreatment] = useState<HighlightTreatment>(skinTreatment);
  const [mark, setMark] = useState<MarkRect | null>(null);
  const [active, setActive] = useState<ActiveSpot | null>(null);

  const live = useRef(opts);
  live.current = opts;

  // A skin switch restyles the mark live: data-skin is picked whenever
  // it is available, with engraving as the default.
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setTreatment(skinTreatment());
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(root, { attributes: true, attributeFilter: ["data-skin"] });
    return () => obs.disconnect();
  }, []);

  // The follow loop runs only while the voice plays: play starts it,
  // pause stops it, so nothing animates while paused.
  useEffect(() => {
    const seen = live.current;
    if (!seen.enabled || !seen.manifest) {
      setActive(null);
      return;
    }
    const audio = seen.audioRef.current;
    if (!audio) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      // Every input is read live each tick: the scene (and its span)
      // can change under a kept chapter manifest, so a closed-over
      // span would gate the voice against the previous scene.
      const heard = live.current;
      if (!heard.enabled || !heard.manifest) return;
      const el = heard.audioRef.current;
      if (!el || el.paused) return;
      const t = el.currentTime;
      const span = heard.span;
      if (span !== null && (t < span.startSec - 0.3 || t > span.endSec + 2)) return;
      const ci = activeChunkAt(heard.manifest.chunks, t);
      if (ci < 0) {
        setActive((prev) => (prev === null ? prev : null));
        return;
      }
      const chunk = heard.manifest.chunks[ci] as ChapterNarration["chunks"][number];
      const wi = activeWordAt(chunk, t);
      setActive((prev) => (prev !== null && prev.chunk === ci && prev.word === wi ? prev : { chunk: ci, word: wi }));
    };
    const onPlay = () => {
      if (!raf) tick();
    };
    const onPause = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    if (!audio.paused) tick();
    return () => {
      cancelAnimationFrame(raf);
      raf = 0;
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [opts.enabled, opts.manifest]);

  // Measure the active word against the column DOM and paint the
  // sentence tint through the Highlight API (no-op where unsupported).
  useLayoutEffect(() => {
    const { columnRef, manifest } = live.current;
    const column = columnRef.current;
    clearSentence();
    if (!column || !manifest || active === null) {
      setMark(null);
      return;
    }
    const chunk = manifest.chunks[active.chunk];
    if (!chunk) {
      setMark(null);
      return;
    }
    const { para, word: wordRange, wordText, sentence } = rangesForChunk(column, chunk, active.word);
    paintSentence(sentence);
    // The spoken paragraph rides into the middle band on its own; after
    // a hand move the mark hides until the reader is back on screen.
    if (para && !followIntoView(para, column)) {
      const view = column.getBoundingClientRect();
      const box = para.getBoundingClientRect();
      if (box.bottom <= view.top || box.top >= view.bottom) {
        setMark(null);
        return;
      }
    }
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
    const box = column.getBoundingClientRect();
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
  }, [active, opts.manifest, treatment]);

  // Click a word to seek there, only while narration runs.
  useEffect(() => {
    const { enabled, columnRef, audioRef } = live.current;
    const column = columnRef.current;
    if (!enabled || !column) return;
    const onClick = (event: MouseEvent) => {
      const audio = audioRef.current;
      const heard = live.current.manifest;
      if (!audio || !heard) return;
      const doc = column.ownerDocument;
      const atPoint = doc.caretRangeFromPoint?.bind(doc);
      const range = atPoint ? atPoint(event.clientX, event.clientY) : null;
      if (!range || range.startContainer.nodeType !== 3) return;
      const p = (range.startContainer.parentElement as Element | null)?.closest?.("p[data-n]");
      if (!p || !column.contains(p)) return;
      const n = Number(p.getAttribute("data-n"));
      if (!Number.isInteger(n)) return;
      const hit = wordAt({ chunks: heard.chunks }, n, range.startOffset);
      if (hit) {
        try {
          audio.currentTime = hit.t0 + 0.001;
        } catch {
          // Past the end; the watchdog advances on timeupdate.
        }
      }
    };
    column.addEventListener("click", onClick);
    return () => column.removeEventListener("click", onClick);
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
  return <EngravingMark mark={mark} />;
}

// The small-caps face runs wider than the in-flow word, so the overlay
// shrinks to the measured word rect (origin left) and never covers
// neighbouring characters. Transforms skip layout, so scrollWidth stays
// the natural width and the scale is stable.
function EngravingMark({ mark }: { mark: MarkRect }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    setScale(engravingScale(mark.width, ref.current?.scrollWidth ?? 0));
  }, [mark.width, mark.word]);
  return (
    <span
      className="narr-mark"
      data-treatment="engraving"
      style={{ left: mark.left, top: mark.top, width: mark.width, height: mark.height }}
      aria-hidden="true"
    >
      <span ref={ref} className="narr-word" style={{ transform: `scaleX(${scale})`, transformOrigin: "left center" }}>
        {mark.word}
      </span>
    </span>
  );
}
