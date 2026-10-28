// Persisted music prefs: style, Chopin mode, volume, and muted. Storage
// can throw (private mode), so every access is guarded and falls back.
// Old values load safely: unknown fields are ignored, a missing or bad
// playlist, volume, or muted falls back to the defaults.
import type { PersistedMusicPrefs } from "@/core/music";

export const MUSIC_PREFS_KEY = "lectoria.music.v1";

export const DEFAULT_VOLUME = 0.8;

type PrefsStorage = Pick<Storage, "getItem" | "setItem">;

function validVolume(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

function readStored(storage: PrefsStorage | undefined): PersistedMusicPrefs | null {
  try {
    if (!storage) return null;
    const raw = storage.getItem(MUSIC_PREFS_KEY);
    if (!raw) return null;
    const json: unknown = JSON.parse(raw);
    if (typeof json !== "object" || json === null) return null;
    const { style, volume, muted, playlist } = json as Record<string, unknown>;
    return {
      style: typeof style === "string" ? style : null,
      volume: validVolume(volume),
      muted: typeof muted === "boolean" ? muted : false,
      playlist: typeof playlist === "boolean" ? playlist : false,
    };
  } catch {
    return null;
  }
}

function writeStored(storage: PrefsStorage | undefined, prefs: PersistedMusicPrefs): void {
  try {
    storage?.setItem(MUSIC_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode: playback continues without persistence.
  }
}

function defaultStorage(): PrefsStorage | undefined {
  try {
    if (typeof window === "undefined") return undefined;
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function loadMusicPrefs(): PersistedMusicPrefs | null {
  return readStored(defaultStorage());
}

// The one owner of the persisted prefs: load caches the full object and
// every partial update merges over it, so a volume or mute change before
// the manifest loads never clobbers the stored style or Chopin mode.
export function createMusicPrefsStore(storage: PrefsStorage | undefined = defaultStorage()) {
  let current: PersistedMusicPrefs | null = null;
  let loaded = false;

  function load(): PersistedMusicPrefs | null {
    if (!loaded) {
      current = readStored(storage);
      loaded = true;
    }
    return current;
  }

  function update(patch: Partial<PersistedMusicPrefs>): PersistedMusicPrefs {
    const base: PersistedMusicPrefs = load() ?? {
      style: null,
      volume: DEFAULT_VOLUME,
      muted: false,
      playlist: false,
    };
    current = { ...base, ...patch };
    writeStored(storage, current);
    return current;
  }

  return { load, update };
}
