// Pure playback math for app/player.tsx. Gain matches loudness without
// re-encoding; the effective end stops or loops a labeled segment.
export function gainVolume(level: number, volume: number, gainDb: number): number {
  return Math.min(1, Math.max(0, level * volume * 10 ** (gainDb / 20)));
}

// A missing endSec means the media end, so the file duration wins.
export function effectiveEnd(endSec: number | undefined, duration: number): number {
  return Math.min(endSec ?? Infinity, duration);
}
