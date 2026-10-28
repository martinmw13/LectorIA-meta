// Shared music manifest and selection types. Pure: no env, no fetch, no audio.
import type { EmotionId, Vector8 } from "./types";

// Hand label for the track: the single emotion it was made to carry.
export type TrackSource = "generated" | "jamendo" | "recording";

export interface Playlist {
  id: string;
  label: string;
  trackIds: string[];
}

// Fixed id for the owner-requested Chopin playlist. The player button
// uses the playlist with this id and shows its label verbatim.
export const CHOPIN_PLAYLIST_ID = "just-play-chopin";

export interface Track {
  id: string;
  src: string;
  // Same audio in a second container for browsers that cannot play src.
  fallbackSrc?: string;
  title: string;
  playlistOnly?: boolean;
  emotion: EmotionId;
  vector: Vector8;
  intensity: number;
  tempo: number;
  durationSec: number;
  startSec: number;
  gainDb: number;
  endSec?: number;
  loop: boolean;
  soundtrack: string;
  style: string;
  source?: TrackSource;
  artist?: string;
  composer?: string;
  license?: string;
  attribution?: string;
  sourceUrl?: string;
}

export interface StyleInfo {
  id: string;
  name: string;
}

export interface Soundtrack {
  id: string;
  name: string;
  style: string;
  credit?: string;
}

export interface MusicManifest {
  version: number;
  styles: StyleInfo[];
  soundtracks: Soundtrack[];
  tracks: Track[];
  playlists: Playlist[];
}

// Session selection: style scopes every pick. Every scheduled select
// and skip ranges over all same-style tracks by emotion score.
export interface MusicSelection {
  style: string | null;
}

export type Rng = () => number;

export interface SelectEnv {
  selection: MusicSelection;
  rng: Rng;
}

export interface PersistedMusicPrefs {
  style: string | null;
  volume: number | null;
  muted: boolean;
  playlist: boolean;
}

export interface SceneSignal {
  vector: Vector8;
  intensity: number;
  tempo: number;
}

export type Similarity = (scene: SceneSignal, track: Track, weights: MusicWeights) => number;

export interface MusicWeights {
  emotion: number;
  intensity: number;
  tempo: number;
}

export interface MusicConfig {
  similarity: Similarity;
  weights: MusicWeights;
  dwellSec: number;
  // Route entries are deliberate jumps, so 5 s absorbs a double pressed
  // Next but still cues inside the first sub-page.
  sceneEntryDwellSec: number;
  minTrackSec: number;
  crossfadeSec: number;
  randomTolerance: number;
}
