// Layout-level narration state: the provider owns the one audio
// element, so scene and sub-page navigation never interrupt playback.
// ScenePage registers its scene and consumes the manifest for highlight.
"use client";

import { createContext, useContext } from "react";
import { useNarrationController, type NarrationController } from "./use-narration";
import type { NarrationChapterEntry } from "./types";

const NarrationContext = createContext<NarrationController | null>(null);

export function NarrationProvider({
  entries,
  sceneOrder,
  onAdvanceScene,
  children,
}: {
  entries: NarrationChapterEntry[];
  sceneOrder: string[];
  onAdvanceScene: (nextSceneId: string) => void;
  children: React.ReactNode;
}) {
  const controller = useNarrationController({ entries, sceneOrder, onAdvanceScene });
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
