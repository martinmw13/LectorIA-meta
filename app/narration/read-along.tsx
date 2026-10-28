// The read-along mark lives in its own small component so the word
// clock and the narration context re-render only this, never the book.
"use client";

import type { RefObject } from "react";
import { useNarration } from "./context";
import { ReadMark, useReadSync } from "./read-sync";

export function ReadAlong({ columnRef }: { columnRef: RefObject<HTMLElement | null> }) {
  const narration = useNarration();
  // The reading column is both container and scroller, so word ranges
  // look up p[data-n] inside it.
  const { mark, treatment } = useReadSync({
    enabled: narration.on,
    audioRef: narration.audioRef,
    manifest: narration.manifest,
    span: narration.span,
    columnRef,
    seekTo: narration.seekTo,
  });
  return <ReadMark mark={mark} treatment={treatment} />;
}
