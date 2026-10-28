"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  CHOPIN_PLAYLIST_ID,
  MUSIC_CONFIG,
  nextTrack,
  parseManifest,
  resolveInitialSelection,
  styleHasTracks,
} from "@/core/music";
import type {
  MusicManifest,
  MusicSelection,
  PersistedMusicPrefs,
  SceneSignal,
  Track,
} from "@/core/music";
import {
  enterPlaylist,
  exitPlaylist,
  initScheduler,
  noteTrackEnded,
  observeScene,
  requestManualTrack,
  requestNext,
  switchStyle,
  tickScheduler,
} from "@/core/music-schedule";
import type { SchedulerState } from "@/core/music-schedule";
import { popHistory, pushHistory } from "@/core/music-history";
import { nextSceneEntry } from "@/core/reader";
import { DEFAULT_VOLUME, loadMusicPrefs, saveMusicPrefs } from "./music-prefs";
import { Player } from "./player";

export interface SlimScene {
  id: string;
  ch: number;
  emotion: SceneSignal | null;
}

// Route entries use the short dwell; the draw and the holds are unchanged.
function entryDwell(): { dwellSec: number } {
  return { dwellSec: MUSIC_CONFIG.sceneEntryDwellSec };
}

// The Chopin playlist, when the manifest defines it with tracks. The
// button stays hidden otherwise, and the player never persists the playlist.
function findChopinPlaylist(manifest: MusicManifest) {
  const found = manifest.playlists.find((p) => p.id === CHOPIN_PLAYLIST_ID) ?? null;
  return found && found.trackIds.length > 0 ? found : null;
}

// Client container: cues music on scene entry only, from the route id.
// Sub-page moves never reach the scheduler. Params can lag a render, so
// the last observed id is compared before every observe call.
export function Reader({ scenes, children }: { scenes: SlimScene[]; children: React.ReactNode }) {
  const routeParams = useParams();
  const param = routeParams?.sceneId;
  const routeSceneId = typeof param === "string" ? param : null;
  const [manifest, setManifest] = useState<MusicManifest | null>(null);
  const [selection, setSelection] = useState<MusicSelection | null>(null);
  const [musicFailed, setMusicFailed] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [replayNonce, setReplayNonce] = useState(0);
  const [fadeSec, setFadeSec] = useState(0);
  const [playlistOn, setPlaylistOn] = useState(false);
  // Volume and mute persist next to the style in one prefs object; the
  // player stays a controlled view over them. State starts at the server
  // defaults so hydration matches, then a mount effect applies stored
  // prefs (parsed once) to volume, muted, and style via prefsRef.
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [muted, setMuted] = useState(false);
  const prefsRef = useRef<PersistedMusicPrefs | null>(null);
  // Ref mirrors so persist handlers always save fresh sound values.
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const byId = useMemo(() => new Map(scenes.map((s) => [s.id, s.emotion])), [scenes]);
  const schedRef = useRef<SchedulerState>(initScheduler());
  const historyRef = useRef<string[]>([]);
  const observedRef = useRef<string | null>(null);
  const liveRef = useRef({ routeSceneId, manifest, selection, currentId, byId, playlistOn });
  liveRef.current = { routeSceneId, manifest, selection, currentId, byId, playlistOn };

  const nowSec = () => Date.now() / 1000;

  const applyDecision = useCallback(
    (
      decision: {
        state: SchedulerState;
        switchToId: string | null;
        crossfadeSec: number;
      },
      opts?: { push?: boolean },
    ) => {
      // A same-id switch (one-track playlist wrap) bails out of setCurrentId,
      // so bump a replay nonce the player effect listens to instead.
      const prevId = schedRef.current.currentId;
      schedRef.current = decision.state;
      if (decision.switchToId !== null) {
        setFadeSec(decision.crossfadeSec);
        if (decision.switchToId === prevId) {
          setReplayNonce((n) => n + 1);
        } else {
          // Every automatic switch banks the outgoing id for Previous.
          // The Previous handler passes push false so it never re-banks.
          if (opts?.push !== false && prevId !== null) {
            historyRef.current = pushHistory(historyRef.current, prevId);
          }
          setCurrentId(decision.switchToId);
        }
      }
    },
    [],
  );

  const persist = useCallback((next: MusicSelection) => {
    setSelection(next);
    saveMusicPrefs({
      style: next.style,
      volume: volumeRef.current,
      muted: mutedRef.current,
    });
  }, []);

  const observe = useCallback(
    (sceneId: string) => {
      const st = liveRef.current;
      if (!st.manifest || !st.selection) return;
      const signal = st.byId.get(sceneId) ?? null;
      applyDecision(
        observeScene(schedRef.current, sceneId, signal, st.manifest, nowSec(), {
          selection: st.selection,
          rng: Math.random,
        }, entryDwell()),
      );
    },
    [applyDecision],
  );

  // Stored prefs load once here, after the server-matching first render.
  // Saves happen only on user actions below, so the defaults above never
  // overwrite storage before this runs. The fetch below resolves later and
  // reads the style through the ref.
  useEffect(() => {
    const prefs = loadMusicPrefs();
    prefsRef.current = prefs;
    if (prefs !== null) {
      if (prefs.volume !== null) setVolume(prefs.volume);
      setMuted(prefs.muted);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/music/manifest.json")
      .then((res) => {
        if (!res.ok) throw new Error(`manifest ${res.status}`);
        return res.json();
      })
      .then((json: unknown) => {
        if (cancelled) return;
        const parsed = parseManifest(json);
        setManifest(parsed);
        setSelection(resolveInitialSelection(parsed, prefsRef.current));
      })
      .catch(() => {
        if (!cancelled) setMusicFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Scene entry: exactly one observe call per scene id, once the manifest
  // lands. The first scene cues at once, so it plays on the first press.
  useEffect(() => {
    const gate = nextSceneEntry({
      observedId: observedRef.current,
      routeId: routeSceneId,
      manifestReady: manifest !== null,
    });
    observedRef.current = gate.nextObservedId;
    if (gate.shouldObserve && routeSceneId) observe(routeSceneId);
  }, [routeSceneId, manifest, observe]);

  useEffect(() => {
    // Settle an expired entry dwell, or re-check the scene after a hold.
    const timer = window.setInterval(() => {
      const st = liveRef.current;
      if (!st.manifest || !st.selection || !st.routeSceneId) return;
      const sceneId = schedRef.current.pendingSceneId ?? st.routeSceneId;
      const signal = st.byId.get(sceneId) ?? null;
      applyDecision(
        tickScheduler(schedRef.current, signal, st.manifest, nowSec(), {
          selection: st.selection,
          rng: Math.random,
        }, entryDwell()),
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, [applyDecision]);

  function skip() {
    const st = liveRef.current;
    if (!st.manifest || !st.selection || !st.routeSceneId) return;
    const signal = st.byId.get(st.routeSceneId) ?? null;
    applyDecision(
      requestNext(schedRef.current, signal, st.manifest, nowSec(), {
        selection: st.selection,
        rng: Math.random,
      }),
    );
  }

  // Previous: back to the last played track, held like a Next. With no
  // history the current track restarts from zero through the replay path,
  // including in playlist mode.
  function goPrev() {
    const st = liveRef.current;
    if (!st.manifest || !st.selection) return;
    if (st.playlistOn) {
      setReplayNonce((n) => n + 1);
      return;
    }
    const popped = popHistory(historyRef.current);
    if (!popped) {
      setReplayNonce((n) => n + 1);
      return;
    }
    historyRef.current = popped.hist;
    applyDecision(
      requestManualTrack(schedRef.current, st.manifest, popped.id, nowSec()),
      { push: false },
    );
  }

  function togglePlaylist() {
    const st = liveRef.current;
    if (!st.manifest || !st.selection) return;
    const playlist = findChopinPlaylist(st.manifest);
    if (!playlist) return;
    if (st.playlistOn) {
      const signal = (st.routeSceneId && st.byId.get(st.routeSceneId)) || null;
      applyDecision(
        exitPlaylist(schedRef.current, signal ?? null, st.manifest, nowSec(), {
          selection: st.selection,
          rng: Math.random,
        }),
      );
      setPlaylistOn(false);
      return;
    }
    applyDecision(enterPlaylist(schedRef.current, st.manifest, playlist.id, nowSec()));
    setPlaylistOn(true);
  }

  function changeVolume(next: number) {
    setVolume(next);
    volumeRef.current = next;
    saveMusicPrefs({
      style: liveRef.current.selection?.style ?? null,
      volume: next,
      muted: mutedRef.current,
    });
  }

  function changeMuted(next: boolean) {
    setMuted(next);
    mutedRef.current = next;
    saveMusicPrefs({
      style: liveRef.current.selection?.style ?? null,
      volume: volumeRef.current,
      muted: next,
    });
  }

  function changeStyle(style: string) {
    const st = liveRef.current;
    if (!st.manifest || !st.selection || !st.routeSceneId || st.playlistOn) return;
    if (style === st.selection.style) return;
    const signal = st.byId.get(st.routeSceneId) ?? null;
    const decision = switchStyle(schedRef.current, signal, st.manifest, nowSec(), style);
    if (decision.switchToId === null) return;
    applyDecision(decision);
    persist({ style });
  }

  function ended(trackId: string) {
    const st = liveRef.current;
    if (!st.manifest || !st.selection || !st.routeSceneId) return;
    const signal = st.byId.get(st.routeSceneId) ?? null;
    applyDecision(
      noteTrackEnded(schedRef.current, signal, st.manifest, trackId, nowSec(), {
        selection: st.selection,
        rng: Math.random,
      }),
    );
  }

  const track: Track | null = manifest?.tracks.find((t) => t.id === currentId) ?? null;
  const empty = manifest !== null && manifest.tracks.length === 0;
  const activeSignal = (routeSceneId && byId.get(routeSceneId)) || null;
  // Styles with at least one emotion-selectable track; hidden while fewer
  // than two qualify.
  const stylesWithTracks =
    manifest?.styles.filter((s) => styleHasTracks(manifest, s.id)) ?? [];
  const activePlaylist = manifest ? findChopinPlaylist(manifest) : null;
  const canSkip =
    manifest !== null &&
    selection !== null &&
    (playlistOn
      ? (activePlaylist?.trackIds.length ?? 0) > 1
      : manifest.tracks.length > 1 &&
        nextTrack(activeSignal ?? null, manifest, currentId, undefined, selection) !== null);
  // Previous restarts the track with no history (including the current
  // playlist piece), so it stays on whenever a track is cued.
  const canPrev = currentId !== null;

  return (
    <>
      <header className="topbar">
        <div className="bar-inner">
          <span className="wordmark">Lectoria</span>
          {musicFailed || empty ? (
            <p className="player-note">Music unavailable. The reader works without it.</p>
          ) : (
            <Player
              track={track}
              replayNonce={replayNonce}
              fadeSec={fadeSec}
              canPrev={canPrev}
              onPrev={goPrev}
              canSkip={canSkip}
              onSkip={skip}
              volume={volume}
              muted={muted}
              onVolumeChange={changeVolume}
              onMutedChange={changeMuted}
              styles={stylesWithTracks}
              styleId={selection?.style ?? null}
              onStyleChange={changeStyle}
              onEnded={ended}
              playlistOn={playlistOn}
              playlistLabel={activePlaylist?.label ?? null}
              onTogglePlaylist={togglePlaylist}
              controlsDisabled={playlistOn}
            />
          )}
        </div>
      </header>
      {children}
    </>
  );
}
