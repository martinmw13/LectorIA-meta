## Playlist mode

`SchedulerState.playlist` holds `{ id, index }` while a fixed playlist
plays. `enterPlaylist` switches at once to the first `trackIds` entry
with `crossfadeSec`, no dwell and no min-track rule. While it is on,
scene changes update the active scene but never switch, `requestNext`
and `noteTrackEnded` advance to the next entry in order and wrap from
the last to the first, and playlist tracks run to their end because the
player forces looping off. `exitPlaylist` clears the playlist state and
switches at once to the best match for the current scene under the
restored selection. The Chopin mode persists in the prefs, so a reload
restores it when the playlist exists and falls back to the stored style
otherwise. The style stickers stay enabled while it is on: pressing one
leaves the playlist straight for that style in one switch, and the
style list hides styles with only playlist tracks.

