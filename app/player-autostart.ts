// Music autostart: reading begins with music unless the user paused it.
// Blocked autoplay arms a one-shot gesture listener that starts playback.
import { useEffect, useRef, type RefObject } from "react";

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
  startPlayback,
}: {
  trackId: string | null;
  rootRef: RefObject<HTMLDivElement | null>;
  startPlayback: () => void;
}): { armGestureStart: () => void; disarmGesture: () => void } {
  const disarmRef = useRef<(() => void) | null>(null);

  // Autoplay with sound was blocked: the first gesture anywhere, including
  // the player's own controls, starts the music once; only the Play/Pause
  // button is left to its own click.
  function armGestureStart() {
    if (disarmRef.current || pausedByUser()) return;
    const onGesture = (event: Event) => {
      const playButton = (event.target as Element | null)?.closest?.("button.play");
      if (playButton && rootRef.current?.contains(playButton)) return;
      disarm();
      if (pausedByUser()) return;
      startPlayback();
    };
    const disarm = () => {
      for (const type of GESTURES) document.removeEventListener(type, onGesture, true);
      disarmRef.current = null;
    };
    for (const type of GESTURES) document.addEventListener(type, onGesture, { capture: true, passive: true });
    disarmRef.current = disarm;
  }

  const disarmGesture = () => disarmRef.current?.();

  const triedRef = useRef(false);

  // Reading begins with music: try to start as soon as the first track is
  // known, unless the user paused it before.
  useEffect(() => {
    if (triedRef.current || trackId === null || pausedByUser()) return;
    triedRef.current = true;
    startPlayback();
  }, [trackId]);

  useEffect(
    () => () => {
      disarmRef.current?.();
    },
    [],
  );

  return { armGestureStart, disarmGesture };
}
