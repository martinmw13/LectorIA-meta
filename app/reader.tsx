"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CHOPIN_PLAYLIST_ID,
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
import { pickActiveScene } from "./active-scene";
import { loadMusicPrefs, saveMusicPrefs } from "./music-prefs";
import { mixOffSelection, styleSelection } from "./music-transitions";
import { Player } from "./player";

export interface SceneMeta {
  id: string;
  title: string;
  emotion: SceneSignal | null;
}

// The Chopin playlist, when the manifest defines it with tracks. The
// button stays hidden otherwise, and the player never persists the mode.
function findChopinPlaylist(manifest: MusicManifest) {
  const found = manifest.playlists.find((p) => p.id === CHOPIN_PLAYLIST_ID) ?? null;
  return found && found.trackIds.length > 0 ? found : null;
}

// Client container: tracks the active scene, runs the pure scheduler
// with wall-clock seconds, and passes the chosen track to the player.
export function Reader({ scenes, children }: { scenes: SceneMeta[]; children: React.ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(scenes[0]?.id ?? null);
  const [manifest, setManifest] = useState<MusicManifest | null>(null);
  const [selection, setSelection] = useState<MusicSelection | null>(null);
  const [musicFailed, setMusicFailed] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [replayNonce, setReplayNonce] = useState(0);
  const [fadeSec, setFadeSec] = useState(0);
  const [isFallback, setIsFallback] = useState(false);
  const [playlistOn, setPlaylistOn] = useState(false);
  const byId = useMemo(() => new Map(scenes.map((s) => [s.id, s])), [scenes]);
  const schedRef = useRef<SchedulerState>(initScheduler());
  const liveRef = useRef({ activeId, manifest, selection, currentId, byId, playlistOn });
  liveRef.current = { activeId, manifest, selection, currentId, byId, playlistOn };

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
    setActiveId(decision.state.activeSceneId);
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
      const signal = st.byId.get(sceneId)?.emotion ?? null;
      applyDecision(
        observeScene(schedRef.current, sceneId, signal, st.manifest, nowSec(), {
          selection: st.selection,
          rng: Math.random,
        }),
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

  // Reselect once the manifest lands so the first scene gets music.
  useEffect(() => {
    if (!manifest) return;
    const st = liveRef.current;
    if (st.activeId) observe(st.activeId);
  }, [manifest, observe]);

  useEffect(() => {
    const snapshot = () =>
      [...document.querySelectorAll<HTMLElement>("section[data-scene-id]")].map((el) => ({
        id: el.dataset.sceneId ?? "",
        top: el.getBoundingClientRect().top,
      }));
    const readActive = () => pickActiveScene(snapshot(), window.innerHeight / 3);
    const observer = new IntersectionObserver(
      () => {
        // Entries are only a trigger; every callback re-snapshots live rects.
        const next = readActive();
        if (next) observe(next);
      },
      { rootMargin: "-30% 0px -65% 0px" },
    );
    document.querySelectorAll("section[data-scene-id]").forEach((el) => observer.observe(el));
    const first = readActive();
    if (first) observe(first);
    const timer = window.setInterval(() => {
      // Settle an expired dwell, or re-check the active scene after a hold.
      const st = liveRef.current;
      if (!st.manifest || !st.selection || !st.activeId) return;
      const sceneId = schedRef.current.pendingSceneId ?? st.activeId;
      const signal = st.byId.get(sceneId)?.emotion ?? null;
      applyDecision(
        tickScheduler(schedRef.current, signal, st.manifest, nowSec(), {
          selection: st.selection,
          rng: Math.random,
        }),
      );
    }, 1000);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [observe, applyDecision]);

  function skip() {
    const st = liveRef.current;
    if (!st.manifest || !st.selection || !st.activeId) return;
    const signal = st.byId.get(st.activeId)?.emotion ?? null;
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
      const signal = (st.activeId && st.byId.get(st.activeId)?.emotion) || null;
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
    if (!st.manifest || !st.selection || !st.activeId || st.playlistOn) return;
    if (style === st.selection.style) return;
    const signal = st.byId.get(st.activeId)?.emotion ?? null;
    const decision = switchStyle(schedRef.current, signal, st.manifest, nowSec(), style);
    if (decision.soundtrackId === null) return;
    applyDecision(decision);
    persist(styleSelection(st.selection, style, decision.soundtrackId));
  }

  function ended(trackId: string) {
    const st = liveRef.current;
    if (!st.manifest || !st.selection || !st.activeId) return;
    const signal = st.byId.get(st.activeId)?.emotion ?? null;
    applyDecision(
      noteTrackEnded(schedRef.current, signal, st.manifest, trackId, nowSec(), {
        selection: st.selection,
        rng: Math.random,
      }),
    );
  }

  const track: Track | null = manifest?.tracks.find((t) => t.id === currentId) ?? null;
  const sceneTitle = (activeId && byId.get(activeId)?.title) || null;
  const empty = manifest !== null && manifest.tracks.length === 0;
  const activeSignal = (activeId && byId.get(activeId)?.emotion) || null;
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
            sceneTitle={sceneTitle}
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
