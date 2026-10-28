# Music files

Two placeholder tracks stand in for the full soundtrack while real
recordings arrive. The reader fetches `manifest.json` from the client
and plays the listed files. No code change is needed to ship real
tracks.

## Drop in real tracks

1. Put the finished audio files under `public/music/`.
2. Edit `manifest.json`: keep version 2 and the shape the
   `parseManifest` function in `core/music.ts` accepts.
3. Set `emotion` by hand to the track's dominant mood: one of `calma`,
   `alegria`, `tristeza`, `suspenso`, `misterio`, `aventura`, `combate`,
   `asombro`. The vector, intensity, and tempo should match what the
   track sounds like.
4. Optional: `startSec` skips an intro on first play and on each loop,
   `loop: false` hands the next pick to the scheduler at the end,
   `artist`, `composer`, `license`, `attribution`, and an https
   `sourceUrl` show in the player bar.
5. Keep `src` values as `/music/` paths or `https` URLs. Remote URLs
   need a `media-src` addition in `next.config.ts`.

Validate with `npm test`. The manifest test loads the committed file
through `parseManifest` and checks that every local `src` exists.

## License note

MusicGen weights are CC-BY-NC. The clips here are test output from
those weights, so this demo stays non-commercial. The same rule covers
the full soundtrack when it lands.
