// Session track selection. Pure: no env, no fetch, no audio.
import type {
  MusicConfig,
  MusicManifest,
  MusicSelection,
  PersistedMusicPrefs,
  Rng,
  SceneSignal,
  Soundtrack,
  Track,
} from "./music-types";
import { dominantEmotion, rankTracks, resolveConfig } from "./music-similarity";

// Reader skip rule: cycle tracks hand-labeled with the scene's dominant
// emotion, in score order, wrapping and skipping the current track. When
// the current track has another emotion, start at the top candidate. With
// no other same-emotion track, fall back to the best track overall that
// Style scope for every pick, minus playlist-only tracks. Playlist tracks
// never enter emotion selection, so the filter lives here, not in callers.
export function candidatesFor(selection: MusicSelection, manifest: MusicManifest): Track[] {
  const audible = manifest.tracks.filter((t) => t.playlistOnly !== true);
  if (selection.style === null) return audible;
  return audible.filter((t) => t.style === selection.style);
}

// Home set in soundtrack mode: the session soundtrack, or the whole
// style set when none is set yet.
export function homeTracks(selection: MusicSelection, styleTracks: Track[]): Track[] {
  if (selection.soundtrackId === null) return styleTracks;
  const home = styleTracks.filter((t) => t.soundtrack === selection.soundtrackId);
  return home.length > 0 ? home : styleTracks;
}

// "Cambiar track": the next same-emotion track in score order, wrapping
// and skipping the current. In soundtrack mode it stays inside the
// current track's soundtrack first, then tries the same emotion in other
// same-style soundtracks, then the best same-style track overall. In
// random mode it ranges over all same-style soundtracks at once. A null
// scene cycles the style set in id order. One track or none gives null.
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
    if (selection?.mode === "random") {
      const at = same.findIndex((t) => t.id === currentTrackId);
      if (at >= 0) return same[(at + 1) % same.length] as Track;
      return same[0] as Track;
    }
    const current = scope.find((t) => t.id === currentTrackId) ?? null;
    const home = current ? same.filter((t) => t.soundtrack === current.soundtrack) : [];
    const homeOthers = home.filter((t) => t.id !== currentTrackId);
    if (homeOthers.length > 0) {
      const at = home.findIndex((t) => t.id === currentTrackId);
      if (at >= 0) return home[(at + 1) % home.length] as Track;
      return home[0] as Track;
    }
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

// Distinct hand-labeled emotions on a soundtrack, ignoring playlist-only
// tracks. The initial session soundtrack is the one covering most
// emotions, ties by lower id.
export function soundtrackCoverage(manifest: MusicManifest, soundtrackId: string): number {
  return new Set(
    manifest.tracks
      .filter((t) => t.soundtrack === soundtrackId && t.playlistOnly !== true)
      .map((t) => t.emotion),
  ).size;
}

// Best emotion coverage among the given soundtracks, ties by lower id.
// Soundtracks with no audible tracks never win.
function bestCoverageSoundtrack(manifest: MusicManifest, soundtracks: Soundtrack[]): string | null {
  let best: string | null = null;
  let bestCover = -1;
  for (const s of soundtracks) {
    if (!manifest.tracks.some((t) => t.soundtrack === s.id && t.playlistOnly !== true)) continue;
    const cover = soundtrackCoverage(manifest, s.id);
    if (cover > bestCover || (cover === bestCover && (best === null || s.id < best))) {
      best = s.id;
      bestCover = cover;
    }
  }
  return best;
}

export function pickInitialSoundtrack(
  manifest: MusicManifest,
  persistedId: string | null,
): string | null {
  if (persistedId !== null && manifest.soundtracks.some((s) => s.id === persistedId)) {
    return persistedId;
  }
  return bestCoverageSoundtrack(manifest, manifest.soundtracks);
}

// True when the style has at least one emotion-selectable track. The style
// selector uses this, so a style with only playlist tracks stays hidden.
export function styleHasTracks(manifest: MusicManifest, style: string): boolean {
  return manifest.tracks.some((t) => t.style === style && t.playlistOnly !== true);
}

// Session defaults on load. A stored style with no tracks and a stored
// soundtrack outside the stored style both fall back to the defaults.
export function resolveInitialSelection(
  manifest: MusicManifest,
  persisted: PersistedMusicPrefs | null,
): MusicSelection {
  const fallbackId = pickInitialSoundtrack(manifest, null);
  const fallbackStyle =
    fallbackId !== null
      ? (manifest.soundtracks.find((s) => s.id === fallbackId)?.style ?? null)
      : null;
  const style =
    persisted?.style !== null &&
    persisted?.style !== undefined &&
    styleHasTracks(manifest, persisted.style)
      ? persisted.style
      : fallbackStyle;
  let soundtrackId: string | null = null;
  if (style !== null) {
    const inStyle = (id: string) =>
      manifest.soundtracks.some((s) => s.id === id && s.style === style);
    if (
      persisted?.soundtrackId !== null &&
      persisted?.soundtrackId !== undefined &&
      inStyle(persisted.soundtrackId)
    ) {
      soundtrackId = persisted.soundtrackId;
    } else {
      soundtrackId = bestCoverageSoundtrack(
        manifest,
        manifest.soundtracks.filter((s) => s.style === style),
      );
    }
  }
  return {
    mode: persisted?.mode === "random" ? "random" : "soundtrack",
    soundtrackId,
    style,
  };
}

// Style change from user action: the session soundtrack becomes the best
// coverage soundtrack in the new style, and the track is the best match
// for the scene within the new style. Never crosses styles. Null when
// the style has no tracks.
export function requestStyleChange(
  manifest: MusicManifest,
  style: string,
  scene: SceneSignal | null,
  override?: Partial<MusicConfig>,
): { soundtrackId: string; track: Track } | null {
  const scoped = manifest.tracks.filter((t) => t.style === style && t.playlistOnly !== true);
  if (scoped.length === 0) return null;
  const config = resolveConfig(override);
  const inStyle = manifest.soundtracks.filter(
    (s) => s.style === style && scoped.some((t) => t.soundtrack === s.id),
  );
  const soundtrackId =
    bestCoverageSoundtrack(manifest, inStyle) ?? inStyle[0]?.id ?? scoped[0]?.soundtrack;
  if (!soundtrackId) return null;
  // Rank inside the picked soundtrack first; the style-wide set is only
  // the fallback when the home lacks the scene emotion.
  const home = scoped.filter((t) => t.soundtrack === soundtrackId);
  if (scene === null) {
    const first =
      [...home].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0] ??
      ([...scoped].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0] as Track);
    return { soundtrackId, track: first };
  }
  const dom = dominantEmotion(scene);
  const emoAcross = scoped.filter((t) => t.emotion === dom);
  const scope =
    home.some((t) => t.emotion === dom) ? home : emoAcross.length > 0 ? emoAcross : scoped;
  const track = rankTracks(scene, { ...manifest, tracks: scope }, config)[0] as Track;
  return { soundtrackId, track };
}
