// Ordered music modes: the style cycle plus the Chopin playlist mode.
// Pure: no env, no fetch, no audio. The control renders this list and the
// session advances through it, so neither knows the style-vs-playlist split.
import { CHOPIN_PLAYLIST_ID } from "./music-types";
import type { MusicManifest, Playlist } from "./music-types";
import { styleHasTracks } from "./music-selection";

// A style id, or the Chopin playlist id.
export type MusicModeId = string;

export interface MusicMode {
  id: MusicModeId;
  kind: "style" | "playlist";
  label: string;
}

// The Chopin playlist, when the manifest defines it with tracks. The
// button stays hidden otherwise.
export function findChopinPlaylist(manifest: MusicManifest): Playlist | null {
  const found = manifest.playlists.find((p) => p.id === CHOPIN_PLAYLIST_ID) ?? null;
  return found && found.trackIds.length > 0 ? found : null;
}

// Styles with tracks in manifest order, then the Chopin mode when available.
export function musicModes(manifest: MusicManifest): MusicMode[] {
  const modes = manifest.styles
    .filter((s) => styleHasTracks(manifest, s.id))
    .map((s): MusicMode => ({ id: s.id, kind: "style", label: s.name }));
  const playlist = findChopinPlaylist(manifest);
  if (playlist) modes.push({ id: playlist.id, kind: "playlist", label: playlist.label });
  return modes;
}

// The mode the view sits on: the playlist id while it plays, else the style.
export function currentMode(view: {
  style: string | null;
  playlistOn: boolean;
}): MusicModeId | null {
  return view.playlistOn ? CHOPIN_PLAYLIST_ID : view.style;
}

// Next in order, wrapping; an unknown or null current starts at the first.
// One mode returns itself.
export function nextMode(modes: MusicMode[], currentId: MusicModeId | null): MusicModeId | null {
  if (modes.length === 0) return null;
  const at = modes.findIndex((m) => m.id === currentId);
  return (modes[(at + 1) % modes.length] as MusicMode).id;
}
