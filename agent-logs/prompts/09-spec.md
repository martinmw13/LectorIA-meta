# Task 9 spec: real music library on Blob, gain, segment end, labels converter

Repo: LectorIA-meta, branch `music-library`, worktree root is the workspace. Read AGENTS.md, SECURITY.md and docs/contracts.md first; they are binding. Task 8 (scene reader) is in flight on another branch and edits app/reader.tsx, app/page.tsx, app/picture-panel.tsx, app/globals.css, AGENTS.md and the reader part of docs/contracts.md. Do not touch those files, except the music manifest section of docs/contracts.md. In app/player.tsx keep the diff small and local (task 8 only removes the `sceneTitle` prop).

## Why

The MusicGen placeholder manifest is replaced by real recordings hosted on Vercel Blob (store `lectoria-images`, public, under `music/v1/`). Three gaps block that:

1. CSP `media-src` allows only `'self' blob:`.
2. Some Jamendo tracks are licensed ND (no derivatives), so their files ship byte-identical and can be 10 dB louder or 5 dB quieter than the -20 LUFS target. Loudness has to be matched at playback.
3. Labeled segments have an end (`endSec`). Cutting files is not allowed for ND tracks and duplicates bytes for the rest, so the player must stop or loop a segment at `endSec`.

Martin labels tracks in a separate page (etiquetar.html) that exports `lectoria-labels.json` (schemaVersion 2). A converter turns that export plus a library file into `public/music/manifest.json`.

## Changes

### 1. CSP (next.config.ts)

`media-src 'self' blob: https://3vuhzq2wmortnuxj.public.blob.vercel-storage.com`. Exact store host, no wildcard. Leave every other directive as is.

### 2. Manifest contract (core/music-types.ts, core/music-manifest.ts)

Two new optional track fields:

- `gainDb`: finite number in [-24, 12]. Default 0. Playback gain relative to the file, used to bring a file to the library loudness target without re-encoding.
- `endSec`: finite number, `endSec > startSec` (startSec defaults to 0) and `endSec <= durationSec`. Default: the media end. The track plays from `startSec` to `endSec`; loop, fade and "ended" logic all use `endSec` as the end.

Out of range values reject with the track id named, like the existing fields. Unknown fields stay ignored (the generated manifest carries `provisional: true` and `labelId`; do not parse or type them). `durationSec` keeps its current meaning (playable length) and the converter sets it to `endSec - startSec`.

### 3. Player (app/player.tsx)

- Gain: each audio element's volume becomes `clamp01(level[i] * volume * 10^(gainDb/20))`, where `gainDb` is from the track loaded in that element. Keep a per-element track ref (or gain ref) set in `requestPlayRef` and wherever `src` is assigned. Positive gain clamps at 1; that is accepted.
- Segment end: the loop and fade logic that now uses `el.duration` uses `effectiveEnd = min(endSec ?? Infinity, el.duration)`. When a non-looping track (or a playlist track) reaches `effectiveEnd`, behave exactly as on the `ended` event (call the same handler once; guard against firing twice for the same play). When a looping track reaches its loop point near `effectiveEnd`, loop back to `startSec` as today.
- No UI change. No new props.

Put the pure parts (gain to volume, effective end) in a small pure helper in core/ with tests, not in the component.

### 4. Converter (pipeline/labels-to-manifest.ts, `npm run build:music`)

`tsx pipeline/labels-to-manifest.ts <labels.json> <library.json> [--reviewed-only] [--out public/music/manifest.json]`. Writes JSON with 2-space indent and a trailing newline; without `--out` prints to stdout. Diagnostics (skipped, missing, warnings) go to stderr. Exit 1 on invalid input or if the output fails `parseManifest`.

Input A, the labels export (schemaVersion 2, reject anything else):

```ts
{ schemaVersion: 2, tracks: ExportTrack[], segments: ExportSegment[], ... }
ExportTrack = { trackId: string; status: "todo" | "validated" | "relabeled" | "discarded"; style?: string; notSoloPiano?: boolean; durationSec?: number; ... }
ExportSegment = { trackId: string; segmentId: string; startSec: number; endSec: number; primary: EmotionId; vector?: Record<EmotionId, number>; intensity: 1|2|3|4|5; tempo: 1|2|3|4|5; note?: string }
```

Input B, `data/music/library.json` (committed; written by the box-side upload step, not by this task):

```ts
{
  version: 1,
  styles: { id: string; name: string }[],
  soundtracks: { id: string; name: string; style: string; credit?: string }[],
  entries: Record<string /* label trackId */, {
    src: string;            // https Blob URL
    soundtrack: string;     // manifest soundtrack id
    durationSec: number;    // file length
    noDerivatives?: boolean;
    gainDb?: number;
    title: string; composer?: string; artist?: string; license?: string; attribution?: string; sourceUrl?: string;
    source?: "generated" | "jamendo" | "recording";
  }>,
  extraTracks?: unknown[],   // manifest tracks copied verbatim (the Chopin playlist tracks)
  playlists?: { id: string; label: string; trackIds: string[] }[]
}
```

Rules:

- Skip `discarded` tracks. With `--reviewed-only`, keep only `validated` and `relabeled`; otherwise `todo` tracks are kept too and every manifest track made from a `todo` track gets `provisional: true`.
- Skip (and list on stderr) export tracks with no library entry, and library entries whose soundtrack style differs from the export track `style` (Martin can move a track between styles; the library needs a soundtrack for it first).
- One manifest track per segment. Track id: the label trackId when the track has one segment, else `segmentId`. `labelId` = label trackId.
- `emotion` = `primary`. `vector` = the segment vector when present (values clamped to 0..1, rounded to 3 decimals), else one-hot on `primary`.
- `intensity` and `tempo`: `(n - 1) / 4`, rounded to 3 decimals.
- Bounds: `startSec` only when > 0; `endSec` only when it is more than 0.5 s before the file end; `durationSec` = (endSec or file length) - startSec, rounded to 1 decimal.
- ND entries (`noDerivatives: true`) always play whole: no `startSec`/`endSec`. If an ND track has several segments, use the longest segment's labels for the whole file and warn on stderr.
- Copy `src`, `soundtrack`, the soundtrack's `style`, `gainDb` (when non-zero), and the credit fields from the entry. `loop: true`.
- Output: `{ version: 3, styles, soundtracks, tracks, playlists }`, tracks sorted by soundtrack then id, followed by `extraTracks`. Run the result through `parseManifest` before writing.

Keep the transform a pure function in pipeline/ (`labelsToManifest(labels, library) => { manifest, warnings }`) with the CLI as a thin shell around it.

### 5. Tests (vitest)

- parseManifest: gainDb and endSec accepted, defaulted, rejected out of range (endSec <= startSec, endSec > durationSec, gainDb 13).
- Pure player helpers: gain to volume with clamp; effective end with and without endSec.
- Converter: a small fixture export (one todo multi-segment track, one validated track with vector, one ND multi-segment track, one discarded, one missing from library) and a fixture library: checks ids, provisional flags, scale mapping (1 -> 0, 3 -> 0.5, 5 -> 1), one-hot fallback, ND whole-file rule, skipped lists, `--reviewed-only`, output passes parseManifest.
- core/music-manifest.test.ts keeps checking that local `/music/` srcs exist; https srcs are not fetched.

### 6. Docs

- docs/contracts.md: only the music manifest section: the two fields, the Blob host, the converter command.
- public/music/README.md: rewrite for the new flow: audio lives on Blob under `music/v1/<soundtrack>/`, never in the repo; `data/music/library.json` maps label ids to Blob URLs and credits; regenerate the manifest with `npm run build:music data/music/labels.json data/music/library.json --out public/music/manifest.json`; ND tracks are uploaded unedited and loudness-matched with `gainDb`; the rest are normalized to about -20 LUFS. Keep the Chopin playlist section accurate. Do not mention MusicGen except in the license note history if needed.
- BUILT_DURING_HACKATHON.md: one row for task 9.

## Out of scope

Uploading audio, editing `public/music/manifest.json`, `data/music/*.json` (the parent agent commits those), any reader component, any network call. Do not run `next start` or `next dev`. `npm run build` is fine.

## Checks

`npm run typecheck`, `npm test`, `npm run test:hooks`, `npm run check:secrets`, `npm run check:size`, `npm run build`.
