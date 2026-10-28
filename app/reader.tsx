"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nextTrack, parseManifest } from "@/core/music";
import type { MusicManifest, SceneSignal, Track } from "@/core/music";
import {
  initScheduler,
  noteTrackEnded,
  observeScene,
  requestNext,
  tickScheduler,
} from "@/core/music-schedule";
import type { SchedulerState } from "@/core/music-schedule";
import { pickActiveScene } from "./active-scene";
import { Player } from "./player";

export interface SceneMeta {
  id: string;
  title: string;
  emotion: SceneSignal | null;
}

// Client container: tracks the active scene, runs the pure scheduler
// with wall-clock seconds, and passes the chosen track to the player.
export function Reader({ scenes, children }: { scenes: SceneMeta[]; children: React.ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(scenes[0]?.id ?? null);
  const [manifest, setManifest] = useState<MusicManifest | null>(null);
  const [musicFailed, setMusicFailed] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [fadeSec, setFadeSec] = useState(0);
  const byId = useMemo(() => new Map(scenes.map((s) => [s.id, s])), [scenes]);
  const schedRef = useRef<SchedulerState>(initScheduler());
  const liveRef = useRef({ activeId, manifest, currentId, byId });
  liveRef.current = { activeId, manifest, currentId, byId };

  const nowSec = () => Date.now() / 1000;

  const applyDecision = useCallback((decision: {
    state: SchedulerState;
    switchToId: string | null;
    crossfadeSec: number;
  }) => {
    schedRef.current = decision.state;
    setActiveId(decision.state.activeSceneId);
    if (decision.switchToId !== null) {
      setCurrentId(decision.switchToId);
      setFadeSec(decision.crossfadeSec);
    }
  }, []);

  const observe = useCallback(
    (sceneId: string) => {
      const st = liveRef.current;
      if (!st.manifest) return;
      const signal = st.byId.get(sceneId)?.emotion ?? null;
      applyDecision(observeScene(schedRef.current, sceneId, signal, st.manifest, nowSec()));
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
        setManifest(parseManifest(json));
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
      if (!st.manifest || !st.activeId) return;
      const sceneId = schedRef.current.pendingSceneId ?? st.activeId;
      const signal = st.byId.get(sceneId)?.emotion ?? null;
      applyDecision(tickScheduler(schedRef.current, signal, st.manifest, nowSec()));
    }, 1000);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [observe, applyDecision]);

  function skip() {
    const st = liveRef.current;
    if (!st.manifest || !st.activeId) return;
    const signal = st.byId.get(st.activeId)?.emotion ?? null;
    applyDecision(requestNext(schedRef.current, signal, st.manifest, nowSec()));
  }

  function ended(trackId: string) {
    const st = liveRef.current;
    if (!st.manifest || !st.activeId) return;
    const signal = st.byId.get(st.activeId)?.emotion ?? null;
    applyDecision(noteTrackEnded(schedRef.current, signal, st.manifest, trackId, nowSec()));
  }

  const track: Track | null = manifest?.tracks.find((t) => t.id === currentId) ?? null;
  const sceneTitle = (activeId && byId.get(activeId)?.title) || null;
  const empty = manifest !== null && manifest.tracks.length === 0;
  const activeSignal = (activeId && byId.get(activeId)?.emotion) || null;
  const canSkip =
    manifest !== null &&
    manifest.tracks.length > 1 &&
    nextTrack(activeSignal ?? null, manifest, currentId) !== null;

  return (
    <>
      <div className="player-bar">
        {musicFailed || empty ? (
          <p className="player-note">Music unavailable. The reader works without it.</p>
        ) : (
          <Player
            track={track}
            fadeSec={fadeSec}
            sceneTitle={sceneTitle}
            canSkip={canSkip}
            onSkip={skip}
            onEnded={ended}
          />
        )}
      </div>
      {children}
    </>
  );
}
