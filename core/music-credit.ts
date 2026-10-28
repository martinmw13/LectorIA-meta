// Now-playing line: Title · Composer · Source. The title stays as the
// manifest gives it (no nickname field exists to split off). Source is
// the track's short credit (artist); it drops out when it would repeat
// the performer. The license and full attribution join the tooltip only.
import type { Track } from "./music-types";

export interface NowPlaying {
  line: string;
  full: string;
}

type Credit = { title: string } & {
  [K in "composer" | "artist" | "license" | "attribution"]?: Pick<Track, K>[K] | null;
};

export function nowPlaying(track: Credit | null): NowPlaying | null {
  if (track === null) return null;
  const who = track.composer ?? track.artist ?? null;
  const source = track.artist && track.artist !== who ? track.artist : null;
  const line = [track.title, who, source].filter((p): p is string => p !== null).join(" · ");
  const full = [track.title, who, source, track.license ?? null, track.attribution ?? null]
    .filter((p): p is string => p !== null)
    .join(" · ");
  return { line, full };
}
