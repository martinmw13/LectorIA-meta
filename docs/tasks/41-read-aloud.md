# 41 · Read aloud in the reader

Builds on task 40 (core/narration.ts, docs/contracts/narration.md, data/books/oz/narration.json, public/narration/v2/...). App code only; no pipeline or Modal changes.

## What the reader gets

A "Read aloud" control that plays the per-chapter Kokoro narration and follows it in the text, word by word, like Kindle/Audible read-along.

- **Control.** Its own component, `app/narration/read-aloud.tsx`, placed in the reader chrome (check app/folio for the current Folio layout; other agents are editing it, so keep the touch points small) (plus a controller hook in `app/narration/`). Play/pause, a narration volume slider, and an on/off state persisted in localStorage `lectoria.narration.v1` as `{on, volume}`. Light mode is the default. Icon: a new `"read-aloud"` entry in `app/icons.tsx` (an open book with two sound-wave arcs), never an emoji, never an inline `<svg>` elsewhere. Colours only from tokens (add tokens to app/tokens.css where needed; no hex or rgb literals in components; skin-ready tests must stay green).
- **Copy.** Warm English. Button label "Read aloud" / "Pause". While a chapter is not ready yet: "Getting the voice ready…". Error: "The voice isn't available right now." Never use the word "Generated".
- **Where it lives.** The controller sits in the layout-level `app/reader.tsx` so it survives scene navigation. It loads each chapter's manifest lazily. data/books/oz/narration.json is about 1 MB with every manifest inline, so it must never reach the client: the server layout derives a small `{chapter → {src, manifest}}` map (the manifest URL is `src` with `.mp3` replaced by `.json`, already served from public/) and passes only that and uses one dedicated `<audio>` element. It is separate from `core/music-session.ts` except for one ducking signal.
- **Continuity.** Playback seeks to the scene's span (`sceneSpan`) and continues into the next scene and the next chapter without user action.
- **Auto page-turn.** When the active word leaves the current sub-page, turn the sub-page (or go to the next scene) automatically, unless the user navigated by hand in the last ~8 s; in that case keep reading and do not yank them back. Pause stays paused across turns.
- **Ducking.** While the voice plays, the music ducks about −18 dB via a `duck` multiplier on the Player, ramped over ~400 ms down and ~800 ms back up. The rain layer is not ducked.

## Word highlight

- Sync in a requestAnimationFrame loop that reads `audio.currentTime` and uses `activeWordAt` / `activeChunkAt` from core/narration.ts. It must survive seek, pause and playbackRate changes (no timers that drift).
- Map word timings to the DOM with fragment offsets: add a `from` character offset to the fragments `paginateScene` (core/reader.ts) produces, so cont fragments of a split paragraph know where they start. Build Ranges on the `<p data-n>` text nodes.
- Current sentence: soft tint via the CSS Custom Highlight API (`CSS.highlights`, `::highlight(narration-sentence)`), with a no-op fallback where unsupported.
- Current word: an absolutely positioned overlay mark placed from `range.getClientRects()` (do not change layout; pagination must not reflow).
- Scroll the active word into view gently only if it is off screen; instant under `prefers-reduced-motion`, and no mark transitions then.
- Click a word to seek there (`wordAt`), only while narration is on.

### Highlight style per skin (Martin's decision)

Martin picked the second treatment of each skin from /workspace/prototypes/highlight/. The style is chosen by `html[data-skin]`; any skin that is not one of the three below, including today's `"default"`, uses engraving.

| skin id      | word mark | sentence tint |
|--------------|-----------|---------------|
| `engraving` (default fallback) | small-caps emphasis on a 1px hairline rule under the word | very faint ink tint |
| `watercolor` | warm sienna bleed swatch with a darker pooled edge, slightly irregular border-radius, tiny blur | faint cool wash |
| `ink-doodle` | loose hand-drawn circle (SVG path from the icon registry style, stroke from tokens) around the word | faint ink tint |

Implementation notes:
- Put the treatment mapping in one small pure function, e.g. `highlightStyleFor(skin: string): "engraving" | "watercolor" | "ink-doodle"`, with a unit test (unknown → engraving).
- Small caps must not reflow the page: render the active word in small caps inside the overlay (a clone of the word on a paper-coloured background sized to the word's rect) rather than restyling the text in flow.
- Mark colours, rule weight and tints are tokens (e.g. `--narration-mark`, `--narration-mark-edge`, `--narration-sentence`) with light and dark values.
- Reference CSS from the prototype (port values into tokens; do not copy hex literals into components):
  - watercolor bleed: `background: rgba(214,134,96,.30); box-shadow: inset 0 0 0 1.5px rgba(184,98,62,.35), 0 0 6px rgba(214,134,96,.25); border-radius: 40% 60% 52% 48%/50% 46% 54% 50%; filter: blur(.4px)`; placed at word rect inset −3px horizontally.
  - ink circle: path `M50 -2 C 80 -3, 104 10, 100 28 C 96 44, 20 46, 4 30 C -6 16, 18 1, 56 2` in viewBox `0 0 100 44`, preserveAspectRatio none, stroke-width 1.8, round caps; box = word rect expanded 6px x, 3px y. The SVG must come from `app/icons.tsx` (add an icon-like entry or a dedicated exported shape there).
  - engraving: `font-variant: small-caps; letter-spacing: .04em; font-weight: 600`, rule 1px at word bottom −2px.
  - mark movement: `transition: left/top/width/height 120ms ease-out`, none under reduced motion.

## Done when

- Unit tests for: highlightStyleFor, fragment `from` offsets, word→range mapping (punctuation, curly quotes, split paragraphs), auto-turn suppression after manual navigation, prefs persistence, duck ramp.
- npm test, typecheck, check:size, check:secrets, skin-ready/icon tests green. Do not run `next start`.
