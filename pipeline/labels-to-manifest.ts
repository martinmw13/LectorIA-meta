// Converter: Martin's etiquetar.html export plus the box-side library file
// become public/music/manifest.json. The transform is pure; the CLI at the
// bottom is a thin shell. Diagnostics go to stderr, JSON to stdout or --out.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { EMOTIONS } from "../core/types";
import type { EmotionId, Vector8 } from "../core/types";
import { parseManifest } from "../core/music-manifest";
import type { Playlist, Soundtrack, StyleInfo, Track } from "../core/music-types";

export interface ManifestTrack extends Omit<Track, "gainDb" | "startSec"> {
  labelId: string;
  provisional?: boolean;
  gainDb?: number;
  startSec?: number;
}

export interface ConvertedManifest {
  version: 3;
  styles: StyleInfo[];
  soundtracks: Soundtrack[];
  tracks: ManifestTrack[];
  playlists: Playlist[];
}

interface ExportTrack {
  trackId: string;
  status: ExportStatus;
  style?: string;
}

interface ExportSegment {
  trackId: string;
  segmentId: string;
  startSec: number;
  endSec: number;
  primary: EmotionId;
  vector?: Vector8;
  intensity: number;
  tempo: number;
}

interface LibraryEntry {
  src: string;
  soundtrack: string;
  durationSec: number;
  noDerivatives?: boolean;
  gainDb?: number;
  title: string;
  composer?: string;
  artist?: string;
  license?: string;
  attribution?: string;
  sourceUrl?: string;
  source?: "generated" | "jamendo" | "recording";
}

interface Library {
  styles: StyleInfo[];
  soundtracks: { id: string; name: string; style: string; credit?: string }[];
  entries: Record<string, LibraryEntry>;
  extraTracks: unknown[];
  playlists: Playlist[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEmotion(value: unknown): value is EmotionId {
  return typeof value === "string" && (EMOTIONS as readonly string[]).includes(value);
}

type ExportStatus = "todo" | "validated" | "relabeled" | "discarded";

function isStatus(value: unknown): value is ExportStatus {
  return value === "todo" || value === "validated" || value === "relabeled" || value === "discarded";
}

function reqString(entry: Record<string, unknown>, key: string, what: string): string {
  const value = entry[key];
  if (typeof value !== "string" || value === "") throw new Error(`${what} needs a non-empty ${key}`);
  return value;
}

function optString(entry: Record<string, unknown>, key: string, what: string): string | undefined {
  const value = entry[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value === "") throw new Error(`${what} ${key} must be a non-empty string`);
  return value;
}

function reqFinite(entry: Record<string, unknown>, key: string, what: string): number {
  const value = entry[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${what} ${key} must be a finite number`);
  }
  return value;
}

function parseLabels(json: unknown): { tracks: ExportTrack[]; segments: ExportSegment[] } {
  if (!isRecord(json)) throw new Error("labels export must be an object");
  if (json.schemaVersion !== 2) {
    throw new Error(`labels export schemaVersion must be 2, got ${String(json.schemaVersion)}`);
  }
  if (!Array.isArray(json.tracks)) throw new Error("labels export tracks must be an array");
  if (!Array.isArray(json.segments)) throw new Error("labels export segments must be an array");
  const tracks = json.tracks.map((entry, i) => {
    if (!isRecord(entry)) throw new Error(`labels track ${i} must be an object`);
    const trackId = reqString(entry, "trackId", `labels track ${i}`);
    const status = entry.status;
    if (!isStatus(status)) {
      throw new Error(`labels track ${trackId} has unknown status ${String(status)}`);
    }
    const style = optString(entry, "style", `labels track ${trackId}`);
    return { trackId, status, ...(style === undefined ? {} : { style }) };
  });
  const segments = json.segments.map((entry, i) => {
    if (!isRecord(entry)) throw new Error(`labels segment ${i} must be an object`);
    const trackId = reqString(entry, "trackId", `labels segment ${i}`);
    const segmentId = reqString(entry, "segmentId", `labels segment ${i}`);
    const what = `segment ${segmentId}`;
    const startSec = reqFinite(entry, "startSec", what);
    const endSec = reqFinite(entry, "endSec", what);
    if (startSec < 0 || endSec <= startSec) throw new Error(`${what} needs 0 <= startSec < endSec`);
    const primary = entry.primary;
    if (!isEmotion(primary)) throw new Error(`${what} primary must be one of the 8 emotion ids`);
    let vector: Vector8 | undefined;
    if (entry.vector !== undefined) {
      if (!isRecord(entry.vector)) throw new Error(`${what} vector must be an object`);
      const out = {} as Record<EmotionId, number>;
      for (const id of EMOTIONS) {
        const raw = entry.vector[id];
        if (raw === undefined) {
          out[id] = 0;
        } else {
          if (typeof raw !== "number" || !Number.isFinite(raw)) {
            throw new Error(`${what} vector ${id} must be a finite number`);
          }
          out[id] = Math.round(Math.min(1, Math.max(0, raw)) * 1000) / 1000;
        }
      }
      vector = out as Vector8;
    }
    const level = (key: string): number => {
      const n = reqFinite(entry, key, what);
      if (!Number.isInteger(n) || n < 1 || n > 5) throw new Error(`${what} ${key} must be an integer 1..5`);
      return n;
    };
    return {
      trackId,
      segmentId,
      startSec,
      endSec,
      primary,
      ...(vector === undefined ? {} : { vector }),
      intensity: level("intensity"),
      tempo: level("tempo"),
    };
  });
  return { tracks, segments };
}

function parseLibrary(json: unknown): Library {
  if (!isRecord(json)) throw new Error("library must be an object");
  if (json.version !== 1) throw new Error(`library version must be 1, got ${String(json.version)}`);
  if (!Array.isArray(json.styles)) throw new Error("library styles must be an array");
  if (!Array.isArray(json.soundtracks)) throw new Error("library soundtracks must be an array");
  if (!Array.isArray(json.playlists ?? [])) throw new Error("library playlists must be an array");
  const soundtracks = json.soundtracks.map((entry, i) => {
    if (!isRecord(entry)) throw new Error(`library soundtrack ${i} must be an object`);
    const credit = optString(entry, "credit", `library soundtrack ${entry.id ?? i}`);
    return {
      id: reqString(entry, "id", `library soundtrack ${i}`),
      name: reqString(entry, "name", `library soundtrack ${i}`),
      style: reqString(entry, "style", `library soundtrack ${i}`),
      ...(credit === undefined ? {} : { credit }),
    };
  });
  if (!isRecord(json.entries)) throw new Error("library entries must be an object");
  const entries: Record<string, LibraryEntry> = {};
  for (const [trackId, raw] of Object.entries(json.entries)) {
    if (!isRecord(raw)) throw new Error(`library entry ${trackId} must be an object`);
    const what = `library entry ${trackId}`;
    const durationSec = reqFinite(raw, "durationSec", what);
    if (durationSec <= 0) throw new Error(`${what} durationSec must be positive`);
    const gainDb = raw.gainDb;
    if (gainDb !== undefined && (typeof gainDb !== "number" || !Number.isFinite(gainDb))) {
      throw new Error(`${what} gainDb must be a finite number`);
    }
    const noDerivatives = raw.noDerivatives;
    if (noDerivatives !== undefined && typeof noDerivatives !== "boolean") {
      throw new Error(`${what} noDerivatives must be a boolean`);
    }
    const source = raw.source;
    if (source !== undefined && source !== "generated" && source !== "jamendo" && source !== "recording") {
      throw new Error(`${what} source must be generated, jamendo, or recording`);
    }
    entries[trackId] = {
      src: reqString(raw, "src", what),
      soundtrack: reqString(raw, "soundtrack", what),
      durationSec,
      title: reqString(raw, "title", what),
      ...(noDerivatives === undefined ? {} : { noDerivatives }),
      ...(gainDb === undefined ? {} : { gainDb }),
      ...(source === undefined ? {} : { source }),
    };
    for (const key of ["composer", "artist", "license", "attribution", "sourceUrl"] as const) {
      const value = optString(raw, key, what);
      if (value !== undefined) entries[trackId]![key] = value;
    }
  }
  const extraTracks = json.extraTracks ?? [];
  if (!Array.isArray(extraTracks)) throw new Error("library extraTracks must be an array");
  return {
    styles: json.styles as StyleInfo[],
    soundtracks,
    entries,
    extraTracks,
    playlists: (json.playlists ?? []) as Playlist[],
  };
}

function oneHot(primary: EmotionId): Vector8 {
  const out = {} as Record<EmotionId, number>;
  for (const id of EMOTIONS) out[id] = id === primary ? 1 : 0;
  return out as Vector8;
}

export function labelsToManifest(
  labelsJson: unknown,
  libraryJson: unknown,
  opts: { reviewedOnly?: boolean } = {},
): { manifest: ConvertedManifest; warnings: string[] } {
  const labels = parseLabels(labelsJson);
  const library = parseLibrary(libraryJson);
  const warnings: string[] = [];
  const styleOf = new Map(library.soundtracks.map((s) => [s.id, s.style]));
  const seen = new Set(labels.tracks.map((t) => t.trackId));
  const segmentsByTrack = new Map<string, ExportSegment[]>();
  for (const seg of labels.segments) {
    if (!seen.has(seg.trackId)) {
      warnings.push(`skip segment ${seg.segmentId}: unknown export track ${seg.trackId}`);
      continue;
    }
    const list = segmentsByTrack.get(seg.trackId) ?? [];
    list.push(seg);
    segmentsByTrack.set(seg.trackId, list);
  }
  const tracks: ManifestTrack[] = [];
  for (const exp of labels.tracks) {
    if (exp.status === "discarded") {
      warnings.push(`skip ${exp.trackId}: discarded`);
      continue;
    }
    if (opts.reviewedOnly && exp.status === "todo") {
      warnings.push(`skip ${exp.trackId}: not reviewed`);
      continue;
    }
    const entry = library.entries[exp.trackId];
    if (!entry) {
      warnings.push(`skip ${exp.trackId}: no library entry`);
      continue;
    }
    const style = styleOf.get(entry.soundtrack);
    if (style === undefined) {
      warnings.push(`skip ${exp.trackId}: unknown soundtrack ${entry.soundtrack}`);
      continue;
    }
    if (exp.style !== undefined && exp.style !== style) {
      warnings.push(
        `skip ${exp.trackId}: export style ${exp.style} differs from soundtrack style ${style}`,
      );
      continue;
    }
    const segs = segmentsByTrack.get(exp.trackId) ?? [];
    if (segs.length === 0) {
      warnings.push(`skip ${exp.trackId}: no segments`);
      continue;
    }
    const provisional = exp.status === "todo";
    if (entry.noDerivatives === true) {
      const longest = segs.reduce((a, b) => (b.endSec - b.startSec > a.endSec - a.startSec ? b : a));
      if (segs.length > 1) {
        warnings.push(`ND ${exp.trackId}: whole file keeps longest segment ${longest.segmentId}`);
      }
      tracks.push(convertSegment(exp.trackId, exp.trackId, longest, entry, style, provisional, true));
      continue;
    }
    for (const seg of segs) {
      tracks.push(
        convertSegment(
          segs.length === 1 ? exp.trackId : seg.segmentId,
          exp.trackId,
          seg,
          entry,
          style,
          provisional,
          false,
        ),
      );
    }
  }
  tracks.sort((a, b) => (a.soundtrack < b.soundtrack ? -1 : a.soundtrack > b.soundtrack ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const raw of library.extraTracks) {
    if (!isRecord(raw)) throw new Error("library extraTracks entries must be objects");
    // parseManifest below checks the full shape before anything is written.
    tracks.push(raw as unknown as ManifestTrack);
  }
  const manifest: ConvertedManifest = {
    version: 3,
    styles: library.styles,
    soundtracks: library.soundtracks,
    tracks,
    playlists: library.playlists,
  };
  parseManifest(manifest);
  return { manifest, warnings };
}

function convertSegment(
  id: string,
  labelId: string,
  seg: ExportSegment,
  entry: LibraryEntry,
  style: string,
  provisional: boolean,
  whole: boolean,
): ManifestTrack {
  const vector = seg.vector ?? oneHot(seg.primary);
  const intensity = Math.round(((seg.intensity - 1) / 4) * 1000) / 1000;
  const tempo = Math.round(((seg.tempo - 1) / 4) * 1000) / 1000;
  const endBeforeFile = seg.endSec < entry.durationSec - 0.5;
  const startSec = !whole && seg.startSec > 0 ? seg.startSec : undefined;
  const endSec = !whole && endBeforeFile ? seg.endSec : undefined;
  const durationSec = Math.round(((endSec ?? entry.durationSec) - (startSec ?? 0)) * 10) / 10;
  return {
    id,
    labelId,
    ...(provisional ? { provisional: true as const } : {}),
    src: entry.src,
    title: entry.title,
    emotion: seg.primary,
    vector,
    intensity,
    tempo,
    durationSec,
    ...(startSec === undefined ? {} : { startSec }),
    ...(entry.gainDb !== undefined && entry.gainDb !== 0 ? { gainDb: entry.gainDb } : {}),
    ...(endSec === undefined ? {} : { endSec }),
    loop: true,
    soundtrack: entry.soundtrack,
    style,
    ...(entry.composer === undefined ? {} : { composer: entry.composer }),
    ...(entry.artist === undefined ? {} : { artist: entry.artist }),
    ...(entry.license === undefined ? {} : { license: entry.license }),
    ...(entry.attribution === undefined ? {} : { attribution: entry.attribution }),
    ...(entry.sourceUrl === undefined ? {} : { sourceUrl: entry.sourceUrl }),
    ...(entry.source === undefined ? {} : { source: entry.source }),
  };
}

const USAGE = "usage: build:music <labels.json> <library.json> [--reviewed-only] [--out manifest.json]";

function main(): void {
  const args = process.argv.slice(2);
  const reviewedOnly = args.includes("--reviewed-only");
  const outFlag = args.indexOf("--out");
  let out: string | undefined;
  if (outFlag !== -1) {
    out = args[outFlag + 1];
    if (out === undefined || out.startsWith("--")) throw new Error(USAGE);
  }
  for (const arg of args) {
    if (arg.startsWith("--") && arg !== "--reviewed-only" && arg !== "--out") {
      throw new Error(`unknown flag ${arg}\n${USAGE}`);
    }
  }
  const inputs = args.filter(
    (arg, i) => !arg.startsWith("--") && (outFlag === -1 || i !== outFlag + 1),
  );
  if (inputs.length !== 2 || inputs[0] === undefined || inputs[1] === undefined) throw new Error(USAGE);
  const labels = JSON.parse(readFileSync(inputs[0], "utf8"));
  const library = JSON.parse(readFileSync(inputs[1], "utf8"));
  const { manifest, warnings } = labelsToManifest(labels, library, { reviewedOnly });
  for (const warning of warnings) console.error(warning);
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  if (out !== undefined) {
    writeFileSync(out, json);
    console.error(`wrote ${manifest.tracks.length} tracks to ${out}`);
  } else {
    process.stdout.write(json);
  }
}

const invokedAsScript =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  try {
    main();
  } catch (error) {
    console.error(`error: ${(error as Error).message}`);
    process.exit(1);
  }
}
