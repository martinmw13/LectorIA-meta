# 41 · Read aloud in the reader

Builds on task 40 (core/narration.ts, docs/contracts/narration.md, data/books/oz/narration.json, public/narration/v2/...). App code only; no pipeline or Modal changes.

## What the reader gets

A "Read aloud" control that plays the per-chapter Kokoro narration and follows it in the text, word by word, like Kindle/Audible read-along.

- **Control.** Its own component, `app/narration/read-aloud.tsx`, placed in the reader chrome (check app/folio for the current Folio layout; other agents are editing it, so keep the touch points small) (plus a controller hook in `app/narration/`). Play/pause, a narration volume slider, and an on/off state persisted in localStorage `lectoria.narration.v1` as `{on, volume}`. Light mode is the default. The button is boxless (no border or filled box) but reads as clickable: pointer cursor, hover/focus-visible colour change from tokens, visible focus ring. Icon: a new `"read-aloud"` entry in `app/icons.tsx` (an open book with two sound-wave arcs), never an emoji, never an inline `<svg>` elsewhere. Colours only from tokens (add tokens to app/tokens.css where needed; no hex or rgb literals in components; skin-ready tests must stay green).
- **Copy.** Warm English. Button label "Read aloud" / "Pause". While a chapter is not ready yet: "Getting the voice ready…". Error: "The voice isn't available right now." Never use the word "Generated".
- **Where it lives.** The controller sits in the layout-level `app/reader.tsx` so it survives scene navigation. It loads each chapter's manifest lazily. data/books/oz/narration.json is about 1 MB with every manifest inline, so it must never reach the client: the server layout derives a small `{chapter → {src, manifest}}` map (the manifest URL is `src` with `.mp3` replaced by `.json`, already served from public/) and passes only that and uses one dedicated `<audio>` element. It is separate from `core/music-session.ts` except for one ducking signal.
- **Continuity.** Pressing play starts at the live scene (the scene most in view, via `useCurrentSceneId` / `getCurrentSceneId`), at that scene's span start, or resumes where it paused when still in that scene. Playback then seeks to each scene's span (`sceneSpan`) and continues into the next scene and the next chapter without user action. A `SceneSync` component registers every live scene with narration; narration never sets the live scene itself, so scroll keeps driving it.
- **Ducking.** While the voice plays, the music sits about 20 dB below the voice: the effective level is min(music, voice × 10^(−20/20)), applied through the existing `duck` multiplier on the Player (computed from the live music and narration volumes, guarding zero/NaN), ramped over ~400 ms down and ~800 ms back up. The rain ambience takes the same duck through `AmbienceController.setDuck`. The level restores on pause, on the end of the book, on error, when Read aloud is turned off, and when leaving the reader.

## Word highlight

- `useReadSync` / `ReadMark` live in `app/leer/book-view.tsx` with the reading column (`.read-col`) as both container and scroller; word ranges look up `p[data-n="<chunk.n>"]` inside it. Sync in a requestAnimationFrame loop that reads `audio.currentTime` and uses `activeWordAt` / `activeChunkAt` from core/narration.ts. It must survive seek, pause and playbackRate changes (no timers that drift). The loop only runs while the voice plays: play starts it, pause stops it, so nothing animates while paused.
- The book is one native scroll column of whole paragraphs, so word timings map straight onto the `<p data-n>` text nodes with no fragment offsets.
- Current sentence: soft tint via the CSS Custom Highlight API (`CSS.highlights`, `::highlight(narration-sentence)`), with a no-op fallback where unsupported.
- Current word: an absolutely positioned overlay mark placed from `range.getClientRects()` (do not change layout).
- Follow the voice with the existing `followIntoView` (middle band, paused 4 s after user wheel/touch/key via `attachFollowPause`); no other scroll code. When the active paragraph is off screen and follow is allowed, bring it in with `followIntoView` on the paragraph element; when follow is paused, keep reading and hide the mark rather than yanking the reader back. Instant under `prefers-reduced-motion`, and no mark transitions then.
- Click a word to seek there (`wordAt`), only while narration is on.

### Highlight style per skin (Martin's decision)

Martin picked the second treatment of each skin from /workspace/prototypes/highlight/. The style is chosen by `html[data-skin]`; any skin that is not one of the six below, including today's `"default"`, uses engraving.

| skin id      | word mark | sentence tint |
|--------------|-----------|---------------|
| `engraving` (default fallback), `pencil` | small-caps emphasis on a 1px hairline rule under the word | very faint ink tint |
| `watercolor`, `chihiro` | warm sienna bleed swatch with a darker pooled edge, slightly irregular border-radius, tiny blur | faint cool wash |
| `ink`, `comic` | loose hand-drawn circle (SVG path from the icon registry style, stroke from tokens) around the word | faint ink tint |

Implementation notes:
- Put the treatment mapping in one small pure function, e.g. `highlightStyleFor(skin: string): "engraving" | "watercolor" | "ink-doodle"`, with a unit test covering all six skins (unknown → engraving).
- Small caps must not reflow the page: render the active word in small caps inside the overlay (a clone of the word on a paper-coloured background sized to the word's rect) rather than restyling the text in flow.
- Mark colours, rule weight and tints are tokens (e.g. `--narration-mark`, `--narration-mark-edge`, `--narration-sentence`) with light and dark values.
- Reference CSS from the prototype (port values into tokens; do not copy hex literals into components):
  - watercolor bleed: `background: rgba(214,134,96,.30); box-shadow: inset 0 0 0 1.5px rgba(184,98,62,.35), 0 0 6px rgba(214,134,96,.25); border-radius: 40% 60% 52% 48%/50% 46% 54% 50%; filter: blur(.4px)`; placed at word rect inset −3px horizontally.
  - ink circle: path `M50 -2 C 80 -3, 104 10, 100 28 C 96 44, 20 46, 4 30 C -6 16, 18 1, 56 2` in viewBox `0 0 100 44`, preserveAspectRatio none, stroke-width 1.8, round caps; box = word rect expanded 6px x, 3px y. The SVG must come from `app/icons.tsx` (add an icon-like entry or a dedicated exported shape there).
  - engraving: `font-variant: small-caps; letter-spacing: .04em; font-weight: 600`, rule 1px at word bottom −2px.
  - mark movement: `transition: left/top/width/height 120ms ease-out`, none under reduced motion.

## Done when

- Unit tests for: highlightStyleFor (all six skins), word→range mapping (punctuation, curly quotes, whole paragraphs, clipping), prefs persistence, duck multiplier (voice at 1 and 0.5, music already quieter, muted music, zero voice) and duck ramp, ambience duck.
- npm test, typecheck, check:size, check:secrets, skin-ready/icon tests green. Do not run `next start`.
