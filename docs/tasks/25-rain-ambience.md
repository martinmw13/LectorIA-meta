# Task 25: rain ambience

One rain button next to the music volume. Each click moves to the next
level: off, drizzle, moderate, storm, then off again. Each level is its
own CC0 loop in `public/ambience/v1/` (see `public/ambience/SOURCES.md`).
Only the storm loop has thunder.

## Behavior

- The rain plays under the music and ignores scene and track changes.
- Changing levels crossfades over 2 s with equal-power curves. Turning
  rain on fades in over 1.5 s, and turning it off fades out over 1.2 s.
- The rain has its own volume (default 0.4). Master mute silences it with
  a short fade, and unmute brings it back.
- The level and the rain volume persist in localStorage under
  `lectoria.ambience.v1` as `{ level, volume }`.
- Nothing plays before a user gesture. A level restored from storage
  starts on the first pointer or key press anywhere in the page.
- Playback uses Web Audio: `AudioBufferSourceNode` with `loop = true`
  loops each file with no gap, and `GainNode` ramps run on the audio
  clock, so fades still finish in a background tab. The client picks
  WebM Opus when `canPlayType` says yes, else M4A.

## Button

| Level | Label | Icon | Halo |
|---|---|---|---|
| off | Rain: off | Outlined cloud, thin stroke, 40% opacity, no drops | none |
| drizzle | Rain: drizzle | Light gray cloud, 3 small drops | celeste `#5AB8F0` |
| moderate | Rain: moderate | Darker gray cloud, 6 drops | yellow `#F2C230` |
| storm | Rain: storm | Same cloud as moderate, drops and a small bolt | red `#E5484D` |

Drops fall in a slow CSS loop, and the bolt flashes briefly every few
seconds in storm. Under `prefers-reduced-motion` the drops and bolt hold
still. State changes crossfade in about 200 ms. The icon is inline SVG.

## Code

- `core/ambience.ts`, pure: the list of ambiences and their levels
  (id, label, color, sources, gain), `nextLevel`, prefs parsing, and the
  fade constants. Adding fireplace or wind later means adding one entry.
- `app/ambience-prefs.ts`: load and save, like `app/music-prefs.ts`.
- `app/ambience-controller.ts`: the level, volume, and mute logic against
  a small engine interface, so tests use a fake engine.
- `app/ambience-engine.ts`: the Web Audio engine.
- `app/rain-button.tsx`: the button, its icons, and the rain volume
  slider. `app/player.tsx` gains one element next to the volume slider.
