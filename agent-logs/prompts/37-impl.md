# Task 37: one owner for persisted music prefs (no clobbering)

Repo martinmw13/LectorIA-meta, worktree /workspace/wt-38, branch `music-prefs-owner` (from main 6159057). Read AGENTS.md first and follow every repo rule (co-author trailer via the hook, file-size hook, check:secrets, isolation). Do not run `next start`, no paid API calls, do not touch data/. Other agents are editing app/player.tsx, app/folio/music-style-control.tsx (music button marquee) and the reader wheel-scroll code: do NOT touch app/player.tsx, app/folio/music-style-control.tsx, or any scroll/wheel handling. Keep the diff in app/reader.tsx minimal (only the prefs save/load lines). Do not touch core/music-session.ts or core/music-schedule.ts.

## The bug (real user bug)
app/reader.tsx saves `lectoria.music.v1` from three places (`send`, `changeVolume`, `changeMuted`), each writing the full object. `changeVolume`/`changeMuted` derive `style` and `playlist` from `sessionRef.current?.view`, which is null before the music manifest loads and stays null forever if that fetch fails. So touching volume or mute early (or after a failed manifest load) overwrites the saved style with `null` and the Chopin mode with `false`. Reload: the user's style and Chopin mode are gone.

## Fix
Give one small, tested module ownership of loading and saving the full prefs. Extend app/music-prefs.ts (or add a sibling module if size requires) with a store, e.g. `createMusicPrefsStore(storage?)` returning `{ load(): PersistedMusicPrefs | null; update(patch: Partial<PersistedMusicPrefs>): PersistedMusicPrefs }`:
- `load` reads storage once (same validation and fallbacks as today's `loadMusicPrefs`) and caches the full object.
- `update(patch)` merges the patch over the last known full prefs (the loaded value, or defaults `{style:null, volume:DEFAULT_VOLUME, muted:false, playlist:false}` when nothing is stored) and writes the merged object. Fields not in the patch are never clobbered. If `update` is called before `load`, it must load first (so stored fields survive).
- Storage access stays guarded (private mode / no window: no throw, in-memory value still merges).
- Keep `MUSIC_PREFS_KEY`, `DEFAULT_VOLUME`, and the old `loadMusicPrefs` behaviour (keep it exported if other code/tests use it; `saveMusicPrefs` may remain only if still used, otherwise remove it and its callers).
In app/reader.tsx: create the store once (ref), load through it in the mount effect, and replace every save: `changeVolume` -> `update({ volume })`, `changeMuted` -> `update({ muted })`, `send` -> `update({ style, playlist })` from the session. Nothing else in reader.tsx changes.

## Tests (app/music-prefs.test.ts, injected fake storage)
- Regression: stored `{style:"piano", playlist:true, volume:0.5, muted:false}`; with no session (manifest not loaded / failed) `update({volume:0.3})` then `update({muted:true})` -> stored style "piano" and playlist true are kept, volume/muted updated.
- update before load still preserves stored fields; empty storage + partial update -> defaults for the rest; bad stored JSON -> defaults; storage that throws -> no throw, merged value returned; old value without `playlist` -> false; round trip.

## Docs
Update docs/contracts/player.md (and docs/contracts/music-session.md if it describes persistence) with: one prefs owner, partial updates merge. Write docs/tasks/37-music-prefs-owner.md (bug, cause, fix) and add a row to BUILT_DURING_HACKATHON.md in the existing format (date 2026-10-28, "37: music prefs owner", author Muse Code (Contributor)).

## Done when
`npm test`, `npm run typecheck`, `npm run build`, `npm run check:isolation`, `npm run check:size`, `npm run check:secrets`, `npm run test:hooks` all pass. 1-2 focused commits. Do not push.
