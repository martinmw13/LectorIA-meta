## Similarity and config

`Similarity = (scene, track, weights) => number`, where
`SceneSignal = { vector, intensity, tempo }`. The default is
`bhattacharyyaSimilarity`: both 8-emotion vectors renormalize to sum 1
(an all-zero vector gives an affinity of 0), `E` is the sum of
`sqrt(s_k * t_k)`, and the score is `weights.emotion * E` plus
`weights.intensity` and `weights.tempo` each for intensity and tempo
closeness. Scoring and ranking pass the resolved config weights in, so
a weights override changes the ranking. `cosineSimilarity` over
`buildFeatures` output stays as an exported alternative. One exported object,
`MUSIC_CONFIG`, holds `similarity`, `weights`, `dwellSec` (20),
`sceneEntryDwellSec` (5), `minTrackSec` (45), `crossfadeSec` (3), and
`randomTolerance` (0.05). Everything else reads from it. Ranking ties go
to the lower track id. Route entries use `sceneEntryDwellSec` as the
dwell override; scoring and overrides are unchanged. One path scopes,
ranks, and draws: `audibleTracks` is the one playlist-only filter,
`compareTrackId` the one tie-break, `rankScored` scores each track once
(best first, ties to lower id), and `selectScheduled` runs the tolerance
window, keep-current, and min-track hold with one rng call per draw.

