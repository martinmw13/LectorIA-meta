# Task 27: light by default, and one swappable music-style control

Repo martinmw13/LectorIA-meta, worktree /workspace/wt-27, branch `light-default` (already checked out, from main). Read AGENTS.md first and follow every repo rule (co-author trailer, RESCUE_LOG.md if you rescue anything, size hook, check:secrets). Do NOT touch the music module (core/music*, the audio engine in app/player.tsx beyond the one import/JSX line noted below) or server/images. Do not generate any images or music. Do not run `next start`.

## 1. Light mode by default
Martin wants the app to start in LIGHT mode on every page, regardless of the OS dark preference. Users can still switch with the existing toggle, and their explicit choice (localStorage `lectoria.theme`) is still honoured.
- app/layout.tsx THEME_SCRIPT: when there is no stored "light"/"dark", use "light". Remove the prefers-color-scheme branch.
- Check every other place that could pick dark without an explicit choice (reader.tsx initial state, any CSS `@media (prefers-color-scheme: dark)`, tokens.css, any other page/layout under app/) and make light the default there too. `:root` must keep the light tokens.
- Add a vitest test that asserts the default is light (e.g. export the script string or a tiny pure `initialTheme(stored)` helper used by it and test: null → light, "garbage" → light, "dark" → dark, "light" → light).

## 2. Isolate the music-style control in one component
The Orchestra/Piano sticker buttons plus the Chopin "Just play Chopin" toggle will be replaced by a single 3-state cycling button (Orchestra → Piano → Just Chopin!), whose design is still being chosen. Do NOT redesign or polish the stickers. Only create a clean seam so the new design can be dropped in later by replacing one file:
- Move app/player-controls.tsx to app/folio/music-style-control.tsx, exporting `MusicStyleControl`. Keep behaviour and markup identical (same labels "Piano", "Orchestra", "Just play Chopin", same aria-pressed, same disabled handling).
- Give it a small, design-neutral props type `MusicStyleControlProps` (exported) that carries everything the 3-state button will need: the styles list, current styleId, onStyleChange, playlistLabel, playlistOn, onTogglePlaylist, controlsDisabled. Add a doc comment at the top saying this is the single swap point for the music-style control and that the player must not know its internals.
- Move all sticker and Chopin-button CSS out of app/styles/player.css into app/styles/music-style-control.css (imported wherever player.css is imported today), so swapping the design means replacing those two files only.
- Update the one import/usage in app/player.tsx. No other player.tsx change.
- Keep/adjust any existing tests that reference the old path.

## Done when
`npm test`, typecheck, build, check:isolation, test:hooks, check:size, check:secrets all pass. Commit in focused commits with the co-author trailer from AGENTS.md. Add a row to BUILT_DURING_HACKATHON.md if the repo convention requires it for each task. Write docs/tasks/27-light-default.md (short: what and why). Do not push.
