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
import type { MusicManifest, MusicSelection, SceneSignal, Track } from "@/core/music";
import {
  enterPlaylist,
  exitPlaylist,
  initScheduler,
  noteTrackEnded,
  observeScene,
  requestNext,
  switchStyle,
  tickScheduler,
} from "@/core/music-schedule";
import type { SchedulerState } from "@/core/music-schedule";
import { isSceneEntry } from "@/core/reader";
import { loadMusicPrefs, saveMusicPrefs } from "./music-prefs";
import { mixOffSelection, styleSelection } from "./music-transitions";
import { Player } from "./player";

export interface SlimScene {
  id: string;
  ch: number;
  emotion: SceneSignal | null;
}

// Route entries use the short dwell; scoring and hysteresis are untouched.
function entryDwell(): { dwellSec: number } {
  return { dwellSec: MUSIC_CONFIG.sceneEntryDwellSec };
}

// The Chopin playlist, when the manifest defines it with tracks. The
// button stays hidden otherwise, and the player never persists the mode.
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
  const [isFallback, setIsFallback] = useState(false);
  const [playlistOn, setPlaylistOn] = useState(false);
  const byId = useMemo(() => new Map(scenes.map((s) => [s.id, s.emotion])), [scenes]);
  const schedRef = useRef<SchedulerState>(initScheduler());
  const observedRef = useRef<string | null>(null);
  const liveRef = useRef({ routeSceneId, manifest, selection, currentId, byId, playlistOn });
  liveRef.current = { routeSceneId, manifest, selection, currentId, byId, playlistOn };

  const nowSec = () => Date.now() / 1000;

  const applyDecision = useCallback((decision: {
    state: SchedulerState;
    switchToId: string | null;
    crossfadeSec: number;
    fallback: boolean;
  }) => {
    // A same-id switch (one-track playlist wrap) bails out of setCurrentId,
    // so bump a replay nonce the player effect listens to instead.
    const prevId = schedRef.current.currentId;
    schedRef.current = decision.state;
    setIsFallback(decision.fallback);
    if (decision.switchToId !== null) {
      setFadeSec(decision.crossfadeSec);
      if (decision.switchToId === prevId) {
        setReplayNonce((n) => n + 1);
      } else {
        setCurrentId(decision.switchToId);
      }
    }
  }, []);

  const persist = useCallback((next: MusicSelection) => {
    setSelection(next);
    saveMusicPrefs({
      mode: next.mode,
      soundtrackId: next.soundtrackId,
      style: next.style,
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
        setSelection(resolveInitialSelection(parsed, loadMusicPrefs()));
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
    if (!routeSceneId || !manifest || !isSceneEntry(observedRef.current, routeSceneId)) return;
    observedRef.current = routeSceneId;
    observe(routeSceneId);
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

  function toggleMix() {
    const st = liveRef.current;
    if (!st.manifest || !st.selection || st.playlistOn) return;
    if (st.selection.mode === "random") {
      // Mixing off keeps the soundtrack of the playing track.
      const playing = st.manifest.tracks.find((t) => t.id === st.currentId) ?? null;
      persist(mixOffSelection(st.selection, playing));
      return;
    }
    persist({ ...st.selection, mode: "random" });
  }

  function changeStyle(style: string) {
    const st = liveRef.current;
    if (!st.manifest || !st.selection || !st.routeSceneId || st.playlistOn) return;
    if (style === st.selection.style) return;
    const signal = st.byId.get(st.routeSceneId) ?? null;
    const decision = switchStyle(schedRef.current, signal, st.manifest, nowSec(), style);
    if (decision.soundtrackId === null) return;
    applyDecision(decision);
    persist(styleSelection(st.selection, style, decision.soundtrackId));
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
  const soundtrackName =
    manifest?.soundtracks.find((s) => s.id === track?.soundtrack)?.name ?? null;
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

  return (
    <>
      <div className="player-bar">
        {musicFailed || empty ? (
          <p className="player-note">Music unavailable. The reader works without it.</p>
        ) : (
          <Player
            track={track}
            replayNonce={replayNonce}
            fadeSec={fadeSec}
            soundtrackName={soundtrackName}
            isFallback={isFallback}
            canSkip={canSkip}
            onSkip={skip}
            mixOn={selection?.mode === "random"}
            onToggleMix={toggleMix}
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
      {children}
    </>
  );
}
