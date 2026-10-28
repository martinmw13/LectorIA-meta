// Track selection and manifest parsing. Pure: no env, no fetch, no audio.
import { EMOTIONS } from "./types";
import type { EmotionId, Vector8 } from "./types";
import { buildFeatures } from "./cluster";

// Hand label for the track: the single emotion it was made to carry.
export type TrackSource = "generated" | "jamendo" | "recording";

export interface Track {
  id: string;
  src: string;
  title: string;
  emotion: EmotionId;
  vector: Vector8;
  intensity: number;
  tempo: number;
  durationSec: number;
  startSec: number;
  loop: boolean;
  source?: TrackSource;
  artist?: string;
  composer?: string;
  license?: string;
  attribution?: string;
  sourceUrl?: string;
}

export interface MusicManifest {
  version: number;
  tracks: Track[];
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
}

// Renormalize the 8 entries to sum 1. Extra keys (such as a Jev
// "unknown" entry) are ignored. An all-zero vector stays all zero.
export function normalize8(vector: Record<string, number>): number[] {
  const values = EMOTIONS.map((id: EmotionId) => {
    const v = vector[id];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  });
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum <= 0) return values.map(() => 0);
  return values.map((v) => v / sum);
}

// Bhattacharyya affinity over the renormalized shapes, plus separate
// intensity and tempo terms. Fair to blended scenes, unlike cosine.
export function bhattacharyyaSimilarity(
  scene: SceneSignal,
  track: Track,
  weights: MusicWeights = MUSIC_CONFIG.weights,
): number {
  const s = normalize8(scene.vector);
  const t = normalize8(track.vector);
  let affinity = 0;
  for (let i = 0; i < s.length; i++) {
    affinity += Math.sqrt((s[i] ?? 0) * (t[i] ?? 0));
  }
  return (
    weights.emotion * affinity +
    weights.intensity * (1 - Math.abs(scene.intensity - track.intensity)) +
    weights.tempo * (1 - Math.abs(scene.tempo - track.tempo))
  );
}

// Cosine over buildFeatures output (vector plus weighted intensity and
// tempo). Kept as an alternative; it favors peaky scenes.
export function cosineSimilarity(scene: SceneSignal, track: Track): number {
  const a = buildFeatures(scene);
  const b = buildFeatures(track);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export const MUSIC_CONFIG: MusicConfig = {
  similarity: bhattacharyyaSimilarity,
  weights: { emotion: 0.7, intensity: 0.15, tempo: 0.15 },
  switchMargin: 0.07,
  dwellSec: 20,
  minTrackSec: 45,
  hardCutMargin: 0.2,
  crossfadeSec: 3,
  hardCutCrossfadeSec: 1.5,
};

export function resolveConfig(override?: Partial<MusicConfig>): MusicConfig {
  if (!override) return MUSIC_CONFIG;
  return {
    ...MUSIC_CONFIG,
    ...override,
    weights: override.weights ?? MUSIC_CONFIG.weights,
  };
}

export function scoreTrack(
  scene: SceneSignal,
  track: Track,
  override?: Partial<MusicConfig>,
): number {
  const config = resolveConfig(override);
  return config.similarity(scene, track, config.weights);
}

// Best score first. Ties go to the lower track id, so ranking is stable.
export function rankTracks(
  scene: SceneSignal,
  manifest: MusicManifest,
  override?: Partial<MusicConfig>,
): Track[] {
  const config = resolveConfig(override);
  return [...manifest.tracks].sort((a, b) => {
    const diff =
      config.similarity(scene, b, config.weights) - config.similarity(scene, a, config.weights);
    if (diff !== 0) return diff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// Dominant emotion of a scene: argmax of the renormalized vector, with
// ties broken by EMOTIONS order.
export function dominantEmotion(scene: SceneSignal): EmotionId {
  const norm = normalize8(scene.vector);
  let best: EmotionId = EMOTIONS[0] as EmotionId;
  let bestValue = -Infinity;
  EMOTIONS.forEach((id: EmotionId, i: number) => {
    const value = norm[i] ?? 0;
    if (value > bestValue) {
      bestValue = value;
      best = id;
    }
  });
  return best;
}

// Reader skip rule: cycle tracks hand-labeled with the scene's dominant
// emotion, in score order, wrapping and skipping the current track. When
// the current track has another emotion, start at the top candidate. With
// no other same-emotion track, fall back to the best track overall that
// is not the current one. A null scene cycles all tracks in id order.
// One track or none gives null, and the UI disables the button then.
export function nextTrack(
  scene: SceneSignal | null,
  manifest: MusicManifest,
  currentTrackId: string | null,
  override?: Partial<MusicConfig>,
): Track | null {
  const tracks = manifest.tracks;
  if (tracks.length <= 1) return null;
  const config = resolveConfig(override);
  if (scene === null) {
    const ids = [...tracks].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const at = ids.findIndex((t) => t.id === currentTrackId);
    return ids[(at + 1) % ids.length] as Track;
  }
  const ranked = rankTracks(scene, manifest, config);
  const same = ranked.filter((t) => t.emotion === dominantEmotion(scene));
  const others = same.filter((t) => t.id !== currentTrackId);
  if (others.length > 0) {
    const at = same.findIndex((t) => t.id === currentTrackId);
    if (at >= 0) return same[(at + 1) % same.length] as Track;
    return same[0] as Track;
  }
  return ranked.find((t) => t.id !== currentTrackId) ?? null;
}

const SUPPORTED_VERSION = 2;
const SOURCES = ["generated", "jamendo", "recording"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.some((entry) => entry === value);
}

function isVector8(value: unknown): value is Vector8 {
  if (!isRecord(value)) return false;
  return EMOTIONS.every(
    (id: EmotionId) =>
      typeof value[id] === "number" &&
      Number.isFinite(value[id]) &&
      (value[id] as number) >= 0 &&
      (value[id] as number) <= 1,
  );
}

function isUnit(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isSrc(value: unknown): value is string {
  return (
    typeof value === "string" && (value.startsWith("/music/") || value.startsWith("https://"))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

// Fail loudly on a bad drop-in manifest so broken files never play quiet.
export function parseManifest(json: unknown): MusicManifest {
  if (!isRecord(json)) throw new Error("manifest must be an object");
  if (json.version !== SUPPORTED_VERSION) {
    throw new Error(`unsupported manifest version: ${String(json.version)}`);
  }
  if (!Array.isArray(json.tracks)) throw new Error("manifest tracks must be an array");
  const tracks = json.tracks.map((entry, i) => {
    if (!isRecord(entry)) throw new Error(`track ${i} must be an object`);
    const { id, src, title, emotion, vector, intensity, tempo } = entry;
    const { durationSec, startSec, loop } = entry;
    const { source, artist, composer, license, attribution, sourceUrl } = entry;
    if (typeof id !== "string" || id === "") throw new Error(`track ${i} needs a string id`);
    if (!isSrc(src)) throw new Error(`track ${id} src must be a /music/ path or https URL`);
    if (typeof title !== "string" || title === "") throw new Error(`track ${id} needs a title`);
    if (!isOneOf(emotion, EMOTIONS)) {
      throw new Error(`track ${id} emotion must be one of the 8 emotion ids`);
    }
    if (!isVector8(vector)) throw new Error(`track ${id} vector must cover the 8 emotion ids`);
    if (!isUnit(intensity)) throw new Error(`track ${id} intensity must be 0..1`);
    if (!isUnit(tempo)) throw new Error(`track ${id} tempo must be 0..1`);
    if (typeof durationSec !== "number" || !Number.isFinite(durationSec) || durationSec <= 0) {
      throw new Error(`track ${id} durationSec must be a positive number`);
    }
    let start = 0;
    if (startSec !== undefined) {
      if (typeof startSec !== "number" || !Number.isFinite(startSec) || startSec < 0) {
        throw new Error(`track ${id} startSec must be >= 0`);
      }
      if (startSec >= durationSec) {
        throw new Error(`track ${id} startSec must be below durationSec`);
      }
      start = startSec;
    }
    let loops = true;
    if (loop !== undefined) {
      if (typeof loop !== "boolean") throw new Error(`track ${id} loop must be a boolean`);
      loops = loop;
    }
    let trackSource: TrackSource | undefined;
    if (source !== undefined) {
      if (!isOneOf(source, SOURCES)) {
        throw new Error(`track ${id} source must be generated, jamendo, or recording`);
      }
      trackSource = source;
    }
    const credit: { artist?: string; composer?: string; license?: string; attribution?: string } = {};
    const pairs = [
      ["artist", artist],
      ["composer", composer],
      ["license", license],
      ["attribution", attribution],
    ] as const;
    for (const [key, value] of pairs) {
      if (value === undefined) continue;
      if (!isNonEmptyString(value)) throw new Error(`track ${id} ${key} must be a non-empty string`);
      credit[key] = value;
    }
    if (sourceUrl !== undefined && (typeof sourceUrl !== "string" || !sourceUrl.startsWith("https://"))) {
      throw new Error(`track ${id} sourceUrl must be an https URL`);
    }
    return {
      id,
      src,
      title,
      emotion,
      vector,
      intensity,
      tempo,
      durationSec,
      startSec: start,
      loop: loops,
      ...credit,
      ...(trackSource === undefined ? {} : { source: trackSource }),
      ...(sourceUrl === undefined ? {} : { sourceUrl }),
    };
  });
  return { version: SUPPORTED_VERSION, tracks };
}
