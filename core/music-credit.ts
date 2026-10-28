// Now-playing line: display title · composer · source. displayTitle
// strips nicknames, key, and opus/catalogue suffixes from the manifest
// title; the tooltip keeps the full title. Source is the artist plus
// the platform named in the attribution (Musopen, Jamendo) when the
// artist does not already name it.
import type { Track } from "./music-types";

export interface NowPlaying {
  line: string;
  full: string;
}

type Credit = { title: string } & {
  [K in "composer" | "artist" | "license" | "attribution"]?: Pick<Track, K>[K] | null;
};

export function displayTitle(title: string): string {
  const out = title
    .replace(/\s*"[^"]*"/g, "")
    .replace(/\s+in\s+[A-G](?:-flat|-sharp)?\s+(?:major|minor)\b/gi, "")
    .replace(/\s*,?\s*\b(?:Op\.\s*\d+|BWV\s*\d*|K\.\s*\d+).*$/, "");
  return out
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/^[,\s]+|[,\s]+$/g, "");
}

function creditSource(artist: string | null | undefined, attribution: string | null | undefined): string | null {
  if (!artist) return null;
  const platform = /musopen/i.test(attribution ?? "")
    ? "Musopen"
    : /jamendo/i.test(attribution ?? "")
      ? "Jamendo"
      : null;
  if (platform && !artist.toLowerCase().includes(platform.toLowerCase())) {
    return `${artist} / ${platform}`;
  }
  return artist;
}

export function nowPlaying(track: Credit | null): NowPlaying | null {
  if (track === null) return null;
  const who = track.composer ?? null;
  const rawSource = creditSource(track.artist, track.attribution);
  const source = rawSource && rawSource !== who ? rawSource : null;
  const line = [displayTitle(track.title), who, source].filter((p): p is string => p !== null).join(" · ");
  const full = [track.title, who, source, track.license ?? null, track.attribution ?? null]
    .filter((p): p is string => p !== null)
    .join(" · ");
  return { line, full };
}
