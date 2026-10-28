// Live scene id for the continuous reader. The reading column updates the
// URL with replaceState (no route remounts), which App Router state may
// not observe, so BookView publishes here and Reader subscribes. The URL
// stays the deep-link source of truth; this is only the live mirror.
import { useSyncExternalStore } from "react";

let current: string | null = null;
const listeners = new Set<() => void>();

export function getCurrentSceneId(): string | null {
  return current;
}

export function setCurrentSceneId(id: string | null): void {
  if (id === current) return;
  current = id;
  for (const notify of [...listeners]) notify();
}

export function subscribeCurrentSceneId(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

export function useCurrentSceneId(): string | null {
  return useSyncExternalStore(subscribeCurrentSceneId, getCurrentSceneId, getCurrentSceneId);
}

// Chapter jumps and pager moves ask the reading column to scroll instead
// of pushing a route. BookView owns the only listener.
export const GOTO_SCENE_EVENT = "lectoria:goto-scene";

export function requestGotoScene(sceneId: string): void {
  window.dispatchEvent(new CustomEvent<string>(GOTO_SCENE_EVENT, { detail: sceneId }));
}
