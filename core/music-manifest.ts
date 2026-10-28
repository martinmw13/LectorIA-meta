// Music manifest parsing. Pure: no env, no fetch, no audio.
import { EMOTIONS } from "./types";
import type { EmotionId, Vector8 } from "./types";
import type {
  MusicManifest,
  Playlist,
  Soundtrack,
  Track,
  TrackSource,
} from "./music-types";

const SUPPORTED_VERSION = 3;
const SOURCES = ["generated", "jamendo", "recording"] as const;
const SLUG = /^[a-z0-9-]+$/;

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
  if (json.version !== 3 && json.version !== 2) {
    throw new Error(`unsupported manifest version: ${String(json.version)}`);
  }
  // A v2 manifest becomes one implicit soundtrack holding every track.
  if (json.version === 2) {
    if (!Array.isArray(json.tracks)) throw new Error("manifest tracks must be an array");
    const tracks = json.tracks.map((entry, i) => parseTrack(entry, i, "default", "orchestral"));
    return {
      version: 3,
      styles: [{ id: "orchestral", name: "Orquesta" }],
      soundtracks: [{ id: "default", name: "Default", style: "orchestral" }],
      tracks,
      playlists: [],
    };
  }
  if (!Array.isArray(json.styles)) throw new Error("manifest styles must be an array");
  if (!Array.isArray(json.soundtracks)) throw new Error("manifest soundtracks must be an array");
  if (!Array.isArray(json.tracks)) throw new Error("manifest tracks must be an array");
  const styles = json.styles.map((entry, i) => {
    if (!isRecord(entry)) throw new Error(`style ${i} must be an object`);
    if (typeof entry.id !== "string" || !SLUG.test(entry.id)) {
      throw new Error(`style ${i} id must be a non-empty lowercase slug`);
    }
    if (typeof entry.name !== "string" || entry.name === "") {
      throw new Error(`style ${entry.id} name must be a non-empty string`);
    }
    return { id: entry.id, name: entry.name };
  });
  const styleIds = new Set<string>();
  for (const s of styles) {
    if (styleIds.has(s.id)) throw new Error(`duplicate style id: ${s.id}`);
    styleIds.add(s.id);
  }
  const soundtracks = json.soundtracks.map((entry, i) => {
    if (!isRecord(entry)) throw new Error(`soundtrack ${i} must be an object`);
    if (typeof entry.id !== "string" || entry.id === "") {
      throw new Error(`soundtrack ${i} needs a non-empty string id`);
    }
    if (typeof entry.name !== "string" || entry.name === "") {
      throw new Error(`soundtrack ${entry.id} name must be a non-empty string`);
    }
    if (typeof entry.style !== "string" || !SLUG.test(entry.style)) {
      throw new Error(`soundtrack ${entry.id} style must be a non-empty lowercase slug`);
    }
    if (!styleIds.has(entry.style)) {
      throw new Error(`soundtrack ${entry.id} style ${entry.style} is not a listed style`);
    }
    const out: Soundtrack = { id: entry.id, name: entry.name, style: entry.style };
    if (entry.credit !== undefined) {
      if (typeof entry.credit !== "string" || entry.credit === "") {
        throw new Error(`soundtrack ${entry.id} credit must be a non-empty string`);
      }
      out.credit = entry.credit;
    }
    return out;
  });
  const trackSoundtracks = new Map(soundtracks.map((s) => [s.id, s.style]));
  const seenSoundtrack = new Set<string>();
  for (const s of soundtracks) {
    if (seenSoundtrack.has(s.id)) throw new Error(`duplicate soundtrack id: ${s.id}`);
    seenSoundtrack.add(s.id);
  }
  const tracks = json.tracks.map((entry, i) => {
    if (!isRecord(entry)) throw new Error(`track ${i} must be an object`);
    const soundtrack: unknown = entry.soundtrack;
    const style: unknown = entry.style;
    if (typeof soundtrack !== "string" || soundtrack === "") {
      throw new Error(`track ${i} needs a soundtrack id`);
    }
    const home = trackSoundtracks.get(soundtrack);
    if (home === undefined) {
      throw new Error(`track ${String(entry.id) || i} soundtrack ${soundtrack} is unknown`);
    }
    if (typeof style !== "string" || style === "") {
      throw new Error(`track ${String(entry.id) || i} needs a style slug`);
    }
    if (!styleIds.has(style)) {
      throw new Error(`track ${String(entry.id) || i} style ${style} is not a listed style`);
    }
    if (style !== home) {
      throw new Error(
        `track ${String(entry.id) || i} style ${style} differs from its soundtrack style ${home}`,
      );
    }
    return parseTrack(entry, i, soundtrack, style);
  });
  const seenTrack = new Set<string>();
  for (const t of tracks) {
    if (seenTrack.has(t.id)) throw new Error(`duplicate track id: ${t.id}`);
    seenTrack.add(t.id);
  }
  const trackIds = new Set(tracks.map((t) => t.id));
  return { version: SUPPORTED_VERSION, styles, soundtracks, tracks, playlists: parsePlaylists(json, trackIds) };
}

// Playlists are optional; a missing key parses as an empty list. Each
// entry names tracks that must exist, so a typo fails loudly at load.
function parsePlaylists(json: Record<string, unknown>, trackIds: Set<string>): Playlist[] {
  if (json.playlists === undefined) return [];
  if (!Array.isArray(json.playlists)) throw new Error("manifest playlists must be an array");
  const seen = new Set<string>();
  return json.playlists.map((entry, i) => {
    if (!isRecord(entry)) throw new Error(`playlist ${i} must be an object`);
    const { id, label, trackIds: ids } = entry;
    if (typeof id !== "string" || id === "") throw new Error(`playlist ${i} needs a non-empty string id`);
    if (seen.has(id)) throw new Error(`duplicate playlist id: ${id}`);
    seen.add(id);
    if (typeof label !== "string" || label === "") {
      throw new Error(`playlist ${id} label must be a non-empty string`);
    }
    if (!Array.isArray(ids)) throw new Error(`playlist ${id} trackIds must be an array`);
    for (const tid of ids) {
      if (typeof tid !== "string" || !trackIds.has(tid)) {
        throw new Error(`playlist ${id} has unknown track id: ${String(tid)}`);
      }
    }
    return { id, label, trackIds: [...ids] as string[] };
  });
}

function parseTrack(entry: unknown, i: number, soundtrack: string, style: string): Track {
  if (!isRecord(entry)) throw new Error(`track ${i} must be an object`);
  {
    const { id, src, title, emotion, vector, intensity, tempo } = entry;
    const { durationSec, startSec, gainDb, endSec, loop, playlistOnly } = entry;
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
      // No upper bound here: startSec is an absolute media position while
      // durationSec is the playable length, so mid-file segments can start
      // past it. The endSec check below bounds the segment instead.
      start = startSec;
    }
    let gain = 0;
    if (gainDb !== undefined) {
      if (typeof gainDb !== "number" || !Number.isFinite(gainDb) || gainDb < -24 || gainDb > 12) {
        throw new Error(`track ${id} gainDb must be a finite number in -24..12`);
      }
      gain = gainDb;
    }
    let end: number | undefined;
    if (endSec !== undefined) {
      if (typeof endSec !== "number" || !Number.isFinite(endSec)) {
        throw new Error(`track ${id} endSec must be a finite number`);
      }
      if (endSec <= start) {
        throw new Error(`track ${id} endSec must be above startSec`);
      }
      // durationSec rounds to 1 decimal, so allow that slack on the end.
      if (endSec - start > durationSec + 0.051) {
        throw new Error(`track ${id} endSec must not pass startSec + durationSec`);
      }
      end = endSec;
    }
    let loops = true;
    if (loop !== undefined) {
      if (typeof loop !== "boolean") throw new Error(`track ${id} loop must be a boolean`);
      loops = loop;
    }
    let only = false;
    if (playlistOnly !== undefined) {
      if (typeof playlistOnly !== "boolean") {
        throw new Error(`track ${id} playlistOnly must be a boolean`);
      }
      only = playlistOnly;
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
      playlistOnly: only,
      emotion,
      vector,
      intensity,
      tempo,
      durationSec,
      startSec: start,
      gainDb: gain,
      ...(end === undefined ? {} : { endSec: end }),
      loop: loops,
      soundtrack,
      style,
      ...credit,
      ...(trackSource === undefined ? {} : { source: trackSource }),
      ...(sourceUrl === undefined ? {} : { sourceUrl }),
    };
  }
}
