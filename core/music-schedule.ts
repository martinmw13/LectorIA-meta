// Pure music scheduler. The reader calls it with explicit nowSec values,
// so dwell, hysteresis, and hard cuts are testable without timers.
import {
  MUSIC_CONFIG,
  candidatesFor,
  dominantEmotion,
  homeTracks,
  nextTrack,
  pickRandomTrack,
  requestStyleChange,
  rankTracks,
  resolveConfig,
  scoreTrack,
} from "./music";
import type { MusicConfig, MusicManifest, SceneSignal, SelectEnv, Track } from "./music";

export interface SchedulerState {
  currentId: string | null;
  currentStartedSec: number;
  activeSceneId: string | null;
  pendingSceneId: string | null;
  pendingSinceSec: number;
  overrideId: string | null;
  overrideSceneId: string | null;
  playlist: { id: string; index: number } | null;
}

export interface ScheduleDecision {
  state: SchedulerState;
  switchToId: string | null;
  crossfadeSec: number;
  hardCut: boolean;
  fallback: boolean;
}

export interface StyleSwitchDecision extends ScheduleDecision {
  soundtrackId: string | null;
}

export function initScheduler(): SchedulerState {
  return {
    currentId: null,
    currentStartedSec: 0,
    activeSceneId: null,
    pendingSceneId: null,
    pendingSinceSec: 0,
    overrideId: null,
    overrideSceneId: null,
    playlist: null,
  };
}

function noChange(state: SchedulerState): ScheduleDecision {
  return { state, switchToId: null, crossfadeSec: 0, hardCut: false, fallback: false };
}

function topRanked(
  signal: SceneSignal | null,
  manifest: MusicManifest,
  config: MusicConfig,
  excludeId?: string | null,
): { id: string; score: number } | null {
  if (signal === null) {
    const ids = [...manifest.tracks]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .filter((t) => t.id !== excludeId);
    const first = ids[0];
    return first ? { id: first.id, score: 0 } : null;
  }
  const ranked = rankTracks(signal, manifest, config).filter((t) => t.id !== excludeId);
  const best = ranked[0];
  return best ? { id: best.id, score: scoreTrack(signal, best, config) } : null;
}

// Pick the switch for a newly active scene: best score wins, but the
// current track holds unless the best beats it by switchMargin after
// minTrackSec, or by hardCutMargin at once (hard cut, short fade).
function gatedEvaluate(
  state: SchedulerState,
  signal: SceneSignal,
  scoped: MusicManifest,
  nowSec: number,
  config: MusicConfig,
): ScheduleDecision {
  const best = topRanked(signal, scoped, config);
  if (!best) return noChange(state);
  const current = scoped.tracks.find((t) => t.id === state.currentId) ?? null;
  if (!current || best.id === current.id) {
    if (!current) {
      return {
        state: { ...state, currentId: best.id, currentStartedSec: nowSec },
        switchToId: best.id,
        crossfadeSec: 0,
        hardCut: false,
        fallback: false,
      };
    }
    return noChange(state);
  }
  const gap = best.score - scoreTrack(signal, current, config);
  if (gap >= config.hardCutMargin) {
    return {
      state: { ...state, currentId: best.id, currentStartedSec: nowSec },
      switchToId: best.id,
      crossfadeSec: config.hardCutCrossfadeSec,
      hardCut: true,
      fallback: false,
    };
  }
  if (gap >= config.switchMargin && nowSec - state.currentStartedSec >= config.minTrackSec) {
    return {
      state: { ...state, currentId: best.id, currentStartedSec: nowSec },
      switchToId: best.id,
      crossfadeSec: config.crossfadeSec,
      hardCut: false,
      fallback: false,
    };
  }
  return noChange(state);
}

// Random mode pick on a scheduled select: the draw keeps the current
// track when it is eligible, so rescans do not churn. Dwell is handled
// by promotion; min-track holds the current pick.
function evaluateRandom(
  state: SchedulerState,
  signal: SceneSignal,
  styleTracks: Track[],
  scoped: MusicManifest,
  nowSec: number,
  config: MusicConfig,
  env: SelectEnv,
): ScheduleDecision {
  const pick = pickRandomTrack(styleTracks, signal, state.currentId, env.rng, config);
  if (!pick || pick.id === state.currentId) return noChange(state);
  if (state.currentId !== null && nowSec - state.currentStartedSec < config.minTrackSec) {
    return noChange(state);
  }
  return {
    state: { ...state, currentId: pick.id, currentStartedSec: nowSec },
    switchToId: pick.id,
    crossfadeSec: state.currentId === null ? 0 : config.crossfadeSec,
    hardCut: false,
    fallback: false,
  };
}

function evaluateSwitch(
  state: SchedulerState,
  signal: SceneSignal | null,
  manifest: MusicManifest,
  nowSec: number,
  config: MusicConfig,
  env: SelectEnv,
): ScheduleDecision {
  if (signal === null) return noChange(state);
  if (state.playlist !== null) return noChange(state);
  const styleTracks = candidatesFor(env.selection, manifest);
  if (styleTracks.length === 0) return noChange(state);
  const scoped = { ...manifest, tracks: styleTracks };
  if (env.selection.mode === "random") {
    return evaluateRandom(state, signal, styleTracks, scoped, nowSec, config, env);
  }
  const home = homeTracks(env.selection, styleTracks);
  const dom = dominantEmotion(signal);
  // Per-scene fallback: when the home soundtrack has no track with the
  // scene emotion, borrow the best same-style track for this scene only.
  const emo = styleTracks.filter((t) => t.emotion === dom);
  const scope = home.some((t) => t.emotion === dom) ? home : emo.length > 0 ? emo : styleTracks;
  const decision = gatedEvaluate(state, signal, { ...manifest, tracks: scope }, nowSec, config);
  if (decision.switchToId === null) return decision;
  const inside = home.some((t) => t.id === decision.switchToId);
  // A fallback pick misses the current track in its scope, which reads
  // as a first play with no fade. Restore the normal crossfade then.
  if (decision.crossfadeSec === 0 && state.currentId !== null) {
    return { ...decision, crossfadeSec: config.crossfadeSec, fallback: !inside };
  }
  return { ...decision, fallback: !inside };
}

function promote(
  state: SchedulerState,
  sceneId: string,
  signal: SceneSignal | null,
  manifest: MusicManifest,
  nowSec: number,
  config: MusicConfig,
  env: SelectEnv,
): ScheduleDecision {
  const settled: SchedulerState = {
    ...state,
    activeSceneId: sceneId,
    pendingSceneId: null,
    pendingSinceSec: 0,
    overrideId: null,
    overrideSceneId: null,
  };
  const decision = evaluateSwitch(settled, signal, manifest, nowSec, config, env);
  return { ...decision, state: { ...decision.state, activeSceneId: sceneId } };
}

// The reading position entered a scene. It becomes pending and the dwell
// clock restarts, so fast scrolling keeps only the newest scene. After
// the pending scene holds for dwellSec it becomes active. The first
// track ever plays at once, with no dwell.
export function observeScene(
  state: SchedulerState,
  sceneId: string,
  signal: SceneSignal | null,
  manifest: MusicManifest,
  nowSec: number,
  env: SelectEnv,
  override?: Partial<MusicConfig>,
): ScheduleDecision {
  const config = resolveConfig(override ?? MUSIC_CONFIG);
  if (state.currentId === null) {
    return promote(state, sceneId, signal, manifest, nowSec, config, env);
  }
  if (sceneId === state.activeSceneId) {
    return noChange({ ...state, pendingSceneId: null, pendingSinceSec: 0 });
  }
  if (sceneId !== state.pendingSceneId) {
    return noChange({ ...state, pendingSceneId: sceneId, pendingSinceSec: nowSec });
  }
  if (nowSec - state.pendingSinceSec < config.dwellSec) return noChange(state);
  return promote(state, sceneId, signal, manifest, nowSec, config, env);
}

// Time passed: settle a pending scene whose dwell has expired, or
// re-check the active scene (a hold from minTrackSec may have expired).
// The reader passes the pending signal when one exists, else the active.
export function tickScheduler(
  state: SchedulerState,
  signal: SceneSignal | null,
  manifest: MusicManifest,
  nowSec: number,
  env: SelectEnv,
  override?: Partial<MusicConfig>,
): ScheduleDecision {
  const config = resolveConfig(override ?? MUSIC_CONFIG);
  if (state.currentId === null) return noChange(state);
  if (state.pendingSceneId !== null) {
    if (nowSec - state.pendingSinceSec < config.dwellSec) return noChange(state);
    return promote(state, state.pendingSceneId, signal, manifest, nowSec, config, env);
  }
  // A skip override holds until the next scene change; promotion clears it.
  if (state.overrideId !== null) return noChange(state);
  if (state.activeSceneId === null) return noChange(state);
  return evaluateSwitch(state, signal, manifest, nowSec, config, env);
}

// Reader skip: the same-emotion Next rule, applied at once with the
// normal crossfade. The choice holds until the next scene change.
export function requestNext(
  state: SchedulerState,
  signal: SceneSignal | null,
  manifest: MusicManifest,
  nowSec: number,
  env: SelectEnv,
  override?: Partial<MusicConfig>,
): ScheduleDecision {
  const config = resolveConfig(override ?? MUSIC_CONFIG);
  if (state.playlist !== null) return advancePlaylist(state, manifest, nowSec, config);
  const next = nextTrack(signal, manifest, state.currentId, config, env.selection);
  if (!next) return noChange(state);
  const home = homeTracks(env.selection, candidatesFor(env.selection, manifest));
  return {
    state: {
      ...state,
      currentId: next.id,
      currentStartedSec: nowSec,
      overrideId: next.id,
      overrideSceneId: state.activeSceneId,
    },
    switchToId: next.id,
    crossfadeSec: config.crossfadeSec,
    hardCut: false,
    fallback: env.selection.mode === "soundtrack" && !home.some((t) => t.id === next.id),
  };
}

// A non-looping track ended: fade into the best remaining track,
// excluding the one that just ended. Never crosses styles.
export function noteTrackEnded(
  state: SchedulerState,
  signal: SceneSignal | null,
  manifest: MusicManifest,
  endedId: string,
  nowSec: number,
  env: SelectEnv,
  override?: Partial<MusicConfig>,
): ScheduleDecision {
  const config = resolveConfig(override ?? MUSIC_CONFIG);
  if (state.playlist !== null) return advancePlaylist(state, manifest, nowSec, config);
  const styleTracks = candidatesFor(env.selection, manifest).filter((t) => t.id !== endedId);
  if (styleTracks.length === 0) return noChange(state);
  const best = topRanked(signal, { ...manifest, tracks: styleTracks }, config);
  if (!best) return noChange(state);
  const home = homeTracks(env.selection, candidatesFor(env.selection, manifest));
  return {
    state: {
      ...state,
      currentId: best.id,
      currentStartedSec: nowSec,
      overrideId: null,
      overrideSceneId: null,
    },
    switchToId: best.id,
    crossfadeSec: config.crossfadeSec,
    hardCut: false,
    fallback: env.selection.mode === "soundtrack" && !home.some((t) => t.id === best.id),
  };
}

// Fixed playlist mode (the Chopin easter egg). Playlist order lives here
// because it reuses SchedulerState and the crossfade config.
function playlistById(manifest: MusicManifest, id: string) {
  return manifest.playlists.find((p) => p.id === id) ?? null;
}

// Enter playlist mode: switch at once to the first track, with no dwell
// and no min-track rule. Scene changes stay tracked but never switch.
export function enterPlaylist(
  state: SchedulerState,
  manifest: MusicManifest,
  playlistId: string,
  nowSec: number,
  override?: Partial<MusicConfig>,
): ScheduleDecision {
  const config = resolveConfig(override ?? MUSIC_CONFIG);
  const playlist = playlistById(manifest, playlistId);
  const firstId = playlist?.trackIds[0];
  const first = firstId ? (manifest.tracks.find((t) => t.id === firstId) ?? null) : null;
  if (!playlist || !first) return noChange(state);
  return {
    state: {
      ...state,
      currentId: first.id,
      currentStartedSec: nowSec,
      overrideId: null,
      overrideSceneId: null,
      playlist: { id: playlist.id, index: 0 },
    },
    switchToId: first.id,
    crossfadeSec: state.currentId === null ? 0 : config.crossfadeSec,
    hardCut: false,
    fallback: false,
  };
}

// Next playlist track in trackIds order, wrapping last to first. Used by
// both the end-of-track path and the Next button while the playlist is on.
function advancePlaylist(
  state: SchedulerState,
  manifest: MusicManifest,
  nowSec: number,
  config: MusicConfig,
): ScheduleDecision {
  if (state.playlist === null) return noChange(state);
  const playlist = playlistById(manifest, state.playlist.id);
  if (!playlist || playlist.trackIds.length === 0) return noChange(state);
  // A one-track playlist wraps onto the same id. That still returns a
  // switch so the ended element re-cues instead of going quiet.
  const nextIndex = (state.playlist.index + 1) % playlist.trackIds.length;
  const nextId = playlist.trackIds[nextIndex];
  if (nextId === undefined) return noChange(state);
  const next = manifest.tracks.find((t) => t.id === nextId) ?? null;
  if (!next) return noChange(state);
  return {
    state: {
      ...state,
      currentId: next.id,
      currentStartedSec: nowSec,
      overrideId: null,
      overrideSceneId: null,
      playlist: { id: playlist.id, index: nextIndex },
    },
    switchToId: next.id,
    crossfadeSec: state.currentId === null ? 0 : config.crossfadeSec,
    hardCut: false,
    fallback: false,
  };
}

// Leave playlist mode: clear the playlist state and switch at once to the
// best match for the current scene under the restored selection.
export function exitPlaylist(
  state: SchedulerState,
  signal: SceneSignal | null,
  manifest: MusicManifest,
  nowSec: number,
  env: SelectEnv,
  override?: Partial<MusicConfig>,
): ScheduleDecision {
  if (state.playlist === null) return noChange(state);
  const config = resolveConfig(override ?? MUSIC_CONFIG);
  const styleTracks = candidatesFor(env.selection, manifest);
  const cleared: SchedulerState = {
    ...state,
    overrideId: null,
    overrideSceneId: null,
    playlist: null,
  };
  const best = topRanked(signal, { ...manifest, tracks: styleTracks }, config);
  if (!best) return { ...noChange(cleared), state: cleared };
  const home = homeTracks(env.selection, styleTracks);
  return {
    state: { ...cleared, currentId: best.id, currentStartedSec: nowSec },
    switchToId: best.id,
    crossfadeSec: state.currentId === null ? 0 : config.crossfadeSec,
    hardCut: false,
    fallback: env.selection.mode === "soundtrack" && !home.some((t) => t.id === best.id),
  };
}

// Style change from user action: switches at once with the normal
// crossfade, no dwell and no min-track rule, and sets the override like
// Next. Returns the new session soundtrack so the reader can store it.
export function switchStyle(
  state: SchedulerState,
  signal: SceneSignal | null,
  manifest: MusicManifest,
  nowSec: number,
  style: string,
  override?: Partial<MusicConfig>,
): StyleSwitchDecision {
  // The reader blocks style changes while a playlist plays. The guard
  // keeps the saved index pointing at the current track if one slips by.
  if (state.playlist !== null) return { ...noChange(state), soundtrackId: null };
  const config = resolveConfig(override ?? MUSIC_CONFIG);
  const picked = requestStyleChange(manifest, style, signal, config);
  if (!picked) return { ...noChange(state), soundtrackId: null };
  const home = manifest.tracks.filter(
    (t) => t.style === style && t.soundtrack === picked.soundtrackId,
  );
  return {
    state: {
      ...state,
      currentId: picked.track.id,
      currentStartedSec: nowSec,
      overrideId: picked.track.id,
      overrideSceneId: state.activeSceneId,
    },
    switchToId: picked.track.id,
    crossfadeSec: config.crossfadeSec,
    hardCut: false,
    fallback: !home.some((t) => t.id === picked.track.id),
    soundtrackId: picked.soundtrackId,
  };
}

export { MUSIC_CONFIG };
