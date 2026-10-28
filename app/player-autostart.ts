// Music autostart: reading begins with music unless the user paused it.
// Blocked autoplay arms a one-shot gesture listener that starts playback.
import { useEffect, useRef, type RefObject } from "react";
import type { Track } from "@/core/music";

// An explicit pause sticks across visits: the reader never auto-starts
// music the user stopped.
const MUSIC_PAUSED_KEY = "lectoria.music.paused";
const GESTURES = ["pointerdown", "keydown", "touchend", "wheel"] as const;

function pausedByUser(): boolean {
  try {
    return window.localStorage.getItem(MUSIC_PAUSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberPaused(paused: boolean) {
  try {
    if (paused) window.localStorage.setItem(MUSIC_PAUSED_KEY, "1");
    else window.localStorage.removeItem(MUSIC_PAUSED_KEY);
  } catch {
    // Private mode: the pause holds for this page only.
  }
}

export function useMusicAutostart({
  trackId,
  rootRef,
  trackRef,
  playingRef,
  startedRef,
  setStarted,
  setPlaying,
  requestPlayRef,
}: {
  trackId: string | null;
  rootRef: RefObject<HTMLDivElement | null>;
  trackRef: RefObject<Track | null>;
  playingRef: RefObject<boolean>;
  startedRef: RefObject<boolean>;
  setStarted: (v: boolean) => void;
  setPlaying: (v: boolean) => void;
  requestPlayRef: RefObject<(next: Track, durSec: number) => void>;
}): { armGestureStart: () => void; disarmGesture: () => void } {
  const disarmRef = useRef<(() => void) | null>(null);

  // Autoplay with sound was blocked: the first gesture anywhere starts the
  // music once. A gesture on the player itself is left to its own buttons.
  function armGestureStart() {
    if (disarmRef.current || pausedByUser()) return;
    const onGesture = (event: Event) => {
      disarm();
      if (rootRef.current?.contains(event.target as Node) || playingRef.current || pausedByUser()) return;
      const next = trackRef.current;
      if (!next) return;
      playingRef.current = true;
      setPlaying(true);
      requestPlayRef.current(next, 0);
    };
    const disarm = () => {
      for (const type of GESTURES) document.removeEventListener(type, onGesture, true);
      disarmRef.current = null;
    };
    for (const type of GESTURES) document.addEventListener(type, onGesture, { capture: true, passive: true });
    disarmRef.current = disarm;
  }

  const disarmGesture = () => disarmRef.current?.();

  // Reading begins with music: try to start as soon as the first track is
  // known, unless the user paused it before.
  useEffect(() => {
    if (startedRef.current || trackId === null || pausedByUser()) return;
    startedRef.current = true;
    setStarted(true);
    playingRef.current = true;
    setPlaying(true);
  }, [trackId]);

  useEffect(
    () => () => {
      disarmRef.current?.();
    },
    [],
  );

  return { armGestureStart, disarmGesture };
}
