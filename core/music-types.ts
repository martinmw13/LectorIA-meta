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
  title: string;
  playlistOnly?: boolean;
  emotion: EmotionId;
  vector: Vector8;
  intensity: number;
  tempo: number;
  durationSec: number;
  startSec: number;
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

// Session selection: style scopes every pick, soundtrackId is the home
// in soundtrack mode, mode picks the ranking rule.
export interface MusicSelection {
  mode: "soundtrack" | "random";
  soundtrackId: string | null;
  style: string | null;
}

export type Rng = () => number;

export interface SelectEnv {
  selection: MusicSelection;
  rng: Rng;
}

export interface PersistedMusicPrefs {
  mode: "soundtrack" | "random";
  soundtrackId: string | null;
  style: string | null;
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
  switchMargin: number;
  dwellSec: number;
  minTrackSec: number;
  hardCutMargin: number;
  crossfadeSec: number;
  hardCutCrossfadeSec: number;
  randomTolerance: number;
}
