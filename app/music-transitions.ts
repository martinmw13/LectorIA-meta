// Pure session-selection transitions for the reader controls. No
// storage or clock here; the component owns guards and persistence.
import type { MusicSelection, Track } from "@/core/music";

// Mixing off keeps the soundtrack and style of the playing track, or the
// session values when nothing plays yet.
export function mixOffSelection(
  selection: MusicSelection,
  playing: Pick<Track, "soundtrack" | "style"> | null,
): MusicSelection {
  return {
    mode: "soundtrack",
    soundtrackId: playing?.soundtrack ?? selection.soundtrackId,
    style: playing?.style ?? selection.style,
  };
}

// A style change keeps the current mode and stores the new home.
export function styleSelection(
  selection: MusicSelection,
  style: string,
  soundtrackId: string,
): MusicSelection {
  return { mode: selection.mode, soundtrackId, style };
}
