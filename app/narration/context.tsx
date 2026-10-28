// Layout-level narration state: the provider owns the one audio
// element, so scrolling never interrupts playback.
"use client";

import { createContext, useContext } from "react";
import { useNarrationController, type NarrationController, type NarrationSceneRef } from "./use-narration";
import type { NarrationChapterEntry } from "./types";

const NarrationContext = createContext<NarrationController | null>(null);

export function NarrationProvider({
  entries,
  scenes,
  musicLevel,
  onAdvanceScene,
  children,
}: {
  entries: NarrationChapterEntry[];
  scenes: NarrationSceneRef[];
  musicLevel: number;
  onAdvanceScene: (nextSceneId: string) => void;
  children: React.ReactNode;
}) {
  const controller = useNarrationController({ entries, scenes, musicLevel, onAdvanceScene });
  return (
    <NarrationContext.Provider value={controller}>
      <audio ref={controller.audioRef} preload="auto" aria-label="Read aloud" />
      {children}
    </NarrationContext.Provider>
  );
}

export function useNarration(): NarrationController {
  const value = useContext(NarrationContext);
  if (!value) throw new Error("useNarration outside NarrationProvider");
  return value;
}
