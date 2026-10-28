# Ambience sources

Rain loops for the reader's ambience button. All three sources are CC0
(public domain dedication), so no attribution is required. We credit
them anyway. Built on 2026-10-28 with ffmpeg 7.1 and numpy; no AI
generation.

| File | Level | Source | Author | License |
| --- | --- | --- | --- | --- |
| v1/rain-drizzle.{webm,m4a} | Drizzle | "Rain (loopable)", clips 3.ogg and 1.ogg, https://opengameart.org/content/rain-loopable | Ylmir | CC0 |
| v1/rain-moderate.{webm,m4a} | Moderate rain | "Summer Rain on Terrace" (#1019), https://bigsoundbank.com/summer-rain-on-terrace-s1019.html | Joseph Sardin (BigSoundBank) | CC0 |
| v1/rain-storm.{webm,m4a} | Storm | "Rain and Thunder #2" (#0740), https://bigsoundbank.com/rain-and-thunder-2-s0740.html | Joseph Sardin (BigSoundBank) | CC0 |

BigSoundBank license page: https://bigsoundbank.com/licenses.html

## Processing

- Drizzle: 3.ogg (45 s) and 1.ogg (27 s), RMS-matched and joined with a
  4 s equal-power crossfade. 64.0 s loop.
- Moderate: 5 s to 87 s of the original FLAC. 82.0 s loop.
- Storm: 0 s to 121 s of the original FLAC, which holds two thunder
  passages. 121.0 s loop, cut at a quiet point between thunder.
- Each loop folds its last 4 s into its first 4 s with an equal-power
  crossfade, so the end runs straight into the start.
- Loudness (EBU R128, integrated): drizzle -33 LUFS, moderate -29 LUFS,
  storm -27 LUFS, so each level is louder than the last. A limiter keeps
  storm thunder under full scale.
- Encodes: Opus 48 kbps VBR in WebM (primary) and AAC-LC 64 kbps in M4A
  (fallback for browsers without WebM Opus).

## Sizes

| File | Bytes |
| --- | --- |
| rain-drizzle.webm | 349549 |
| rain-drizzle.m4a | 527234 |
| rain-moderate.webm | 448482 |
| rain-moderate.m4a | 678968 |
| rain-storm.webm | 691069 |
| rain-storm.m4a | 1002790 |

## Why public/ and not Blob

Music lives in the `lectoria-images` Blob store. These loops ship in
`public/` instead: they total about 3.7 MB, come from the same origin
(no CSP change for `connect-src`, which the Web Audio fetch needs), and
uploading to Blob needs the write token, which this task does not read.
Move them to `ambience/v1/` on Blob later by changing the `src` list in
`core/ambience.ts` and adding the store host to `connect-src`.
