// Pure music scheduler. The reader calls it with explicit nowSec values,
// so dwell, hysteresis, and hard cuts are testable without timers.
import { MUSIC_CONFIG, nextTrack, rankTracks, resolveConfig, scoreTrack } from "./music";
import type { MusicConfig, MusicManifest, SceneSignal } from "./music";

export interface SchedulerState {
  currentId: string | null;
  currentStartedSec: number;
  activeSceneId: string | null;
  pendingSceneId: string | null;
  pendingSinceSec: number;
  overrideId: string | null;
  overrideSceneId: string | null;
}

export interface ScheduleDecision {
  state: SchedulerState;
  switchToId: string | null;
  crossfadeSec: number;
  hardCut: boolean;
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
  };
}

function noChange(state: SchedulerState): ScheduleDecision {
  return { state, switchToId: null, crossfadeSec: 0, hardCut: false };
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
function evaluateSwitch(
  state: SchedulerState,
  signal: SceneSignal | null,
  manifest: MusicManifest,
  nowSec: number,
  config: MusicConfig,
): ScheduleDecision {
  if (signal === null) return noChange(state);
  const best = topRanked(signal, manifest, config);
  if (!best) return noChange(state);
  const current = manifest.tracks.find((t) => t.id === state.currentId) ?? null;
  if (!current || best.id === current.id) {
    if (!current) {
      return {
        state: { ...state, currentId: best.id, currentStartedSec: nowSec },
        switchToId: best.id,
        crossfadeSec: 0,
        hardCut: false,
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
    };
  }
  if (gap >= config.switchMargin && nowSec - state.currentStartedSec >= config.minTrackSec) {
    return {
      state: { ...state, currentId: best.id, currentStartedSec: nowSec },
      switchToId: best.id,
      crossfadeSec: config.crossfadeSec,
      hardCut: false,
    };
  }
  return noChange(state);
}

function promote(
  state: SchedulerState,
  sceneId: string,
  signal: SceneSignal | null,
  manifest: MusicManifest,
  nowSec: number,
  config: MusicConfig,
): ScheduleDecision {
  const settled: SchedulerState = {
    ...state,
    activeSceneId: sceneId,
    pendingSceneId: null,
    pendingSinceSec: 0,
    overrideId: null,
    overrideSceneId: null,
  };
  const decision = evaluateSwitch(settled, signal, manifest, nowSec, config);
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
  override?: Partial<MusicConfig>,
): ScheduleDecision {
  const config = resolveConfig(override ?? MUSIC_CONFIG);
  if (state.currentId === null) {
    return promote(state, sceneId, signal, manifest, nowSec, config);
  }
  if (sceneId === state.activeSceneId) {
    return noChange({ ...state, pendingSceneId: null, pendingSinceSec: 0 });
  }
  if (sceneId !== state.pendingSceneId) {
    return noChange({ ...state, pendingSceneId: sceneId, pendingSinceSec: nowSec });
  }
  if (nowSec - state.pendingSinceSec < config.dwellSec) return noChange(state);
  return promote(state, sceneId, signal, manifest, nowSec, config);
}

// Time passed: settle a pending scene whose dwell has expired, or
// re-check the active scene (a hold from minTrackSec may have expired).
// The reader passes the pending signal when one exists, else the active.
export function tickScheduler(
  state: SchedulerState,
  signal: SceneSignal | null,
  manifest: MusicManifest,
  nowSec: number,
  override?: Partial<MusicConfig>,
): ScheduleDecision {
  const config = resolveConfig(override ?? MUSIC_CONFIG);
  if (state.currentId === null) return noChange(state);
  if (state.pendingSceneId !== null) {
    if (nowSec - state.pendingSinceSec < config.dwellSec) return noChange(state);
    return promote(state, state.pendingSceneId, signal, manifest, nowSec, config);
  }
  // A skip override holds until the next scene change; promotion clears it.
  if (state.overrideId !== null) return noChange(state);
  if (state.activeSceneId === null) return noChange(state);
  return evaluateSwitch(state, signal, manifest, nowSec, config);
}

// Reader skip: the same-emotion Next rule, applied at once with the
// normal crossfade. The choice holds until the next scene change.
export function requestNext(
  state: SchedulerState,
  signal: SceneSignal | null,
  manifest: MusicManifest,
  nowSec: number,
  override?: Partial<MusicConfig>,
): ScheduleDecision {
  const config = resolveConfig(override ?? MUSIC_CONFIG);
  const next = nextTrack(signal, manifest, state.currentId, config);
  if (!next) return noChange(state);
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
  };
}

// A non-looping track ended: fade into the best remaining track,
// excluding the one that just ended.
export function noteTrackEnded(
  state: SchedulerState,
  signal: SceneSignal | null,
  manifest: MusicManifest,
  endedId: string,
  nowSec: number,
  override?: Partial<MusicConfig>,
): ScheduleDecision {
  const config = resolveConfig(override ?? MUSIC_CONFIG);
  const best = topRanked(signal, manifest, config, endedId);
  if (!best) return noChange(state);
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
  };
}

export { MUSIC_CONFIG };
