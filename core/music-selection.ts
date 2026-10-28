// Session track selection. Pure: no env, no fetch, no audio.
import type {
  MusicConfig,
  MusicManifest,
  MusicSelection,
  PersistedMusicPrefs,
  Rng,
  SceneSignal,
  Track,
} from "./music-types";
import { dominantEmotion, rankTracks, resolveConfig } from "./music-similarity";

// Style scope for every pick, minus playlist-only tracks. Playlist tracks
// never enter emotion selection, so the filter lives here, not in callers.
export function candidatesFor(selection: MusicSelection, manifest: MusicManifest): Track[] {
  const audible = manifest.tracks.filter((t) => t.playlistOnly !== true);
  if (selection.style === null) return audible;
  return audible.filter((t) => t.style === selection.style);
}

// Next track: the next same-emotion track in score order across the whole
// style, wrapping and skipping the current. With no other same-emotion
// track, the best same-style track overall. A null scene cycles the style
// set in id order. One track or none gives null.
export function nextTrack(
  scene: SceneSignal | null,
  manifest: MusicManifest,
  currentTrackId: string | null,
  override?: Partial<MusicConfig>,
  selection?: MusicSelection | null,
): Track | null {
  const scope =
    selection == null
      ? manifest.tracks.filter((t) => t.playlistOnly !== true)
      : candidatesFor(selection, manifest);
  if (scope.length <= 1) return null;
  const config = resolveConfig(override);
  const scoped = { ...manifest, tracks: scope };
  if (scene === null) {
    const ids = [...scope].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const at = ids.findIndex((t) => t.id === currentTrackId);
    return ids[(at + 1) % ids.length] as Track;
  }
  const ranked = rankTracks(scene, scoped, config);
  const same = ranked.filter((t) => t.emotion === dominantEmotion(scene));
  const others = same.filter((t) => t.id !== currentTrackId);
  if (others.length > 0) {
    const at = same.findIndex((t) => t.id === currentTrackId);
    if (at >= 0) return same[(at + 1) % same.length] as Track;
    return same[0] as Track;
  }
  return ranked.find((t) => t.id !== currentTrackId) ?? null;
}

// Random mode draw: same-style tracks with the scene's dominant emotion
// (or the whole style set when none matches), scored, kept within
// randomTolerance of the best. The current track stays when eligible;
// otherwise the draw skips it when an alternative exists.
export function pickRandomTrack(
  cands: Track[],
  scene: SceneSignal | null,
  excludeId: string | null,
  rng: Rng,
  override?: Partial<MusicConfig>,
): Track | null {
  if (cands.length === 0) return null;
  if (scene === null) {
    const ids = [...cands].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const at = ids.findIndex((t) => t.id === excludeId);
    return ids[(at + 1) % ids.length] as Track;
  }
  const config = resolveConfig(override);
  const scoped = { version: 3, styles: [], soundtracks: [], playlists: [], tracks: cands };
  const ranked = rankTracks(scene, scoped, config);
  const dom = dominantEmotion(scene);
  const pool = ranked.filter((t) => t.emotion === dom);
  const kept = (pool.length > 0 ? pool : ranked).map((t) => ({
    track: t,
    score: config.similarity(scene, t, config.weights),
  }));
  const best = kept[0]?.score ?? 0;
  const eligible = kept.filter((e) => e.score >= best - config.randomTolerance);
  const current = excludeId !== null ? eligible.find((e) => e.track.id === excludeId) : undefined;
  if (current) return current.track;
  const rest = eligible.filter((e) => e.track.id !== excludeId);
  const drawFrom = rest.length > 0 ? rest : eligible;
  if (drawFrom.length === 0) return null;
  return (drawFrom[Math.floor(rng() * drawFrom.length)] as { track: Track }).track;
}

// True when the style has at least one emotion-selectable track. The style
// selector uses this, so a style with only playlist tracks stays hidden.
export function styleHasTracks(manifest: MusicManifest, style: string): boolean {
  return manifest.tracks.some((t) => t.style === style && t.playlistOnly !== true);
}

// Session defaults on load. A stored style with no tracks falls back to
// the first style that has any.
export function resolveInitialSelection(
  manifest: MusicManifest,
  persisted: PersistedMusicPrefs | null,
): MusicSelection {
  const fallback = manifest.styles.find((s) => styleHasTracks(manifest, s.id))?.id ?? null;
  const style =
    persisted?.style !== null &&
    persisted?.style !== undefined &&
    styleHasTracks(manifest, persisted.style)
      ? persisted.style
      : fallback;
  return { style };
}

// Style change from user action: the best match for the scene in the new
// style by score. Never crosses styles. Null when the style has no tracks.
export function requestStyleChange(
  manifest: MusicManifest,
  style: string,
  scene: SceneSignal | null,
  override?: Partial<MusicConfig>,
): { track: Track } | null {
  const scoped = manifest.tracks.filter((t) => t.style === style && t.playlistOnly !== true);
  if (scoped.length === 0) return null;
  const config = resolveConfig(override);
  if (scene === null) {
    const first = [...scoped].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0] as Track;
    return { track: first };
  }
  const track = rankTracks(scene, { ...manifest, tracks: scoped }, config)[0] as Track;
  return { track };
}
