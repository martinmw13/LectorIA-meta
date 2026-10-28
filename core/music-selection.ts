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
import { compareTrackId, dominantEmotion, rankScored, rankTracks, resolveConfig } from "./music-similarity";
import type { RankedTrack } from "./music-similarity";

// The one audible-scope filter: playlist-only tracks never enter emotion
// selection, so every scope below goes through here.
export function audibleTracks(manifest: MusicManifest): Track[] {
  return manifest.tracks.filter((t) => t.playlistOnly !== true);
}

// Style scope for every pick. A null style means the whole audible set.
export function candidatesFor(selection: MusicSelection, manifest: MusicManifest): Track[] {
  const audible = audibleTracks(manifest);
  if (selection.style === null) return audible;
  return audible.filter((t) => t.style === selection.style);
}

// Best match by score, ties to the lower id. A null scene takes the
// first track in id order. Skips one id (the ended track) when given.
export function bestRanked(
  scene: SceneSignal | null,
  tracks: Track[],
  excludeId?: string | null,
  override?: Partial<MusicConfig>,
): Track | null {
  const eligible =
    excludeId === null || excludeId === undefined
      ? tracks
      : tracks.filter((t) => t.id !== excludeId);
  if (eligible.length === 0) return null;
  if (scene === null) return [...eligible].sort(compareTrackId)[0] ?? null;
  return rankScored(scene, eligible, override)[0]?.track ?? null;
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
  const scope = candidatesFor(selection ?? { style: null }, manifest);
  if (scope.length <= 1) return null;
  const config = resolveConfig(override);
  const scoped = { ...manifest, tracks: scope };
  if (scene === null) {
    const ids = [...scope].sort(compareTrackId);
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

export interface ScheduledDraw {
  cands: Track[];
  scene: SceneSignal | null;
  currentId: string | null;
  currentStartedSec: number;
  nowSec: number;
  rng: Rng;
  override?: Partial<MusicConfig>;
}

// The one scheduled draw: same-style tracks with the scene's dominant
// emotion (or the whole style set when none matches), kept within
// randomTolerance of the best. The current track stays when eligible;
// otherwise the min-track hold keeps it until it played long enough,
// and the draw skips it when an alternative exists. One rng call per
// draw, only when a draw happens.
export function selectScheduled(draw: ScheduledDraw): Track | null {
  const { cands, scene, currentId, rng } = draw;
  if (cands.length === 0 || scene === null) return null;
  const config = resolveConfig(draw.override);
  const ranked = rankScored(scene, cands, config);
  const dom = dominantEmotion(scene);
  const pool = ranked.filter((entry) => entry.track.emotion === dom);
  const kept = pool.length > 0 ? pool : ranked;
  const best = kept[0]?.score ?? 0;
  const eligible = kept.filter((entry) => entry.score >= best - config.randomTolerance);
  const current = currentId !== null ? eligible.find((entry) => entry.track.id === currentId) : undefined;
  if (current) return current.track;
  if (currentId !== null && draw.nowSec - draw.currentStartedSec < config.minTrackSec) return null;
  const rest = eligible.filter((entry) => entry.track.id !== currentId);
  const drawFrom = rest.length > 0 ? rest : eligible;
  if (drawFrom.length === 0) return null;
  return (drawFrom[Math.floor(rng() * drawFrom.length)] as RankedTrack).track;
}

// Random mode draw: the scheduled draw without the min-track hold, which
// only the scheduler owns. An infinite clock always passes the hold.
export function pickRandomTrack(
  cands: Track[],
  scene: SceneSignal | null,
  excludeId: string | null,
  rng: Rng,
  override?: Partial<MusicConfig>,
): Track | null {
  if (cands.length === 0) return null;
  if (scene === null) {
    const ids = [...cands].sort(compareTrackId);
    const at = ids.findIndex((t) => t.id === excludeId);
    return ids[(at + 1) % ids.length] as Track;
  }
  return selectScheduled({
    cands,
    scene,
    currentId: excludeId,
    currentStartedSec: 0,
    nowSec: Number.POSITIVE_INFINITY,
    rng,
    override,
  });
}

// True when the style has at least one emotion-selectable track. The style
// selector uses this, so a style with only playlist tracks stays hidden.
export function styleHasTracks(manifest: MusicManifest, style: string): boolean {
  return audibleTracks(manifest).some((t) => t.style === style);
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
  const scoped = audibleTracks(manifest).filter((t) => t.style === style);
  if (scoped.length === 0) return null;
  const track = bestRanked(scene, scoped, null, override);
  return track ? { track } : null;
}
