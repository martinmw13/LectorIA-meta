"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { parseManifest, styleHasTracks } from "@/core/music";
import type { MusicManifest, PersistedMusicPrefs, SceneSignal } from "@/core/music";
import { dispatch, findChopinPlaylist, startSession } from "@/core/music-session";
import type { MusicIntent, MusicSession, SessionView } from "@/core/music-session";
import { nextSceneEntry } from "@/core/reader";
import { DEFAULT_VOLUME, loadMusicPrefs, saveMusicPrefs } from "./music-prefs";
import { Player } from "./player";

export interface SlimScene {
  id: string;
  ch: number;
  emotion: SceneSignal | null;
}

// Client container: bridges the music session to React state. It cues
// music on scene entry only, from the route id. Sub-page moves never
// reach the session. Params can lag a render, so the last observed id
// is compared before every scene entry.
export function Reader({ scenes, children }: { scenes: SlimScene[]; children: React.ReactNode }) {
  const routeParams = useParams();
  const param = routeParams?.sceneId;
  const routeSceneId = typeof param === "string" ? param : null;
  const [manifest, setManifest] = useState<MusicManifest | null>(null);
  const [view, setView] = useState<SessionView | null>(null);
  const [musicFailed, setMusicFailed] = useState(false);
  // Volume and mute persist next to the style in one prefs object; the
  // player stays a controlled view over them. State starts at the server
  // defaults so hydration matches, then a mount effect applies stored
  // prefs (parsed once) to volume, muted, and style via prefsRef.
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [muted, setMuted] = useState(false);
  const prefsRef = useRef<PersistedMusicPrefs | null>(null);
  // Ref mirrors so send and persist handlers always read fresh values.
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const byId = useMemo(() => new Map(scenes.map((s) => [s.id, s.emotion])), [scenes]);
  const byIdRef = useRef(byId);
  byIdRef.current = byId;
  const manifestRef = useRef(manifest);
  manifestRef.current = manifest;
  const routeRef = useRef(routeSceneId);
  routeRef.current = routeSceneId;
  const sessionRef = useRef<MusicSession | null>(null);
  const observedRef = useRef<string | null>(null);

  // The one bridge into the session: builds the context (clock, rng,
  // scene signals) and mirrors the view and a style change to state.
  const send = useCallback((intent: MusicIntent) => {
    const session = sessionRef.current;
    const fetched = manifestRef.current;
    if (!session || !fetched) return;
    const next = dispatch(session, intent, {
      manifest: fetched,
      signalOf: (sceneId) => byIdRef.current.get(sceneId) ?? null,
      routeSceneId: routeRef.current,
      nowSec: Date.now() / 1000,
      rng: Math.random,
    });
    sessionRef.current = next;
    if (next.view !== session.view) setView(next.view);
    if (next.selection !== session.selection) {
      saveMusicPrefs({
        style: next.selection.style,
        volume: volumeRef.current,
        muted: mutedRef.current,
      });
    }
  }, []);

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
        const session = startSession(parsed, prefsRef.current);
        sessionRef.current = session;
        setView(session.view);
      })
      .catch(() => {
        if (!cancelled) setMusicFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Scene entry: exactly one sceneEntered per scene id, once the manifest
  // lands. The first scene cues at once, so it plays on the first press.
  useEffect(() => {
    const gate = nextSceneEntry({
      observedId: observedRef.current,
      routeId: routeSceneId,
      manifestReady: manifest !== null,
    });
    observedRef.current = gate.nextObservedId;
    if (gate.shouldObserve && routeSceneId) send({ type: "sceneEntered", sceneId: routeSceneId });
  }, [routeSceneId, manifest, send]);

  useEffect(() => {
    // Settle an expired entry dwell, or re-check the scene after a hold.
    const timer = window.setInterval(() => {
      send({ type: "tick" });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [send]);

  function skip() {
    send({ type: "skip" });
  }

  // Previous: back to the last played track, held like a Next. With no
  // history the current track restarts from zero through the replay path,
  // including in playlist mode.
  function goPrev() {
    send({ type: "previous" });
  }

  function togglePlaylist() {
    send({ type: "playlistToggled" });
  }

  function changeVolume(next: number) {
    setVolume(next);
    volumeRef.current = next;
    saveMusicPrefs({
      style: sessionRef.current?.view.style ?? null,
      volume: next,
      muted: mutedRef.current,
    });
  }

  function changeMuted(next: boolean) {
    setMuted(next);
    mutedRef.current = next;
    saveMusicPrefs({
      style: sessionRef.current?.view.style ?? null,
      volume: volumeRef.current,
      muted: next,
    });
  }

  function changeStyle(style: string) {
    send({ type: "styleChanged", style });
  }

  function ended(trackId: string) {
    send({ type: "trackEnded", trackId });
  }

  const currentId = view?.currentId ?? null;
  const track = manifest?.tracks.find((t) => t.id === currentId) ?? null;
  const empty = manifest !== null && manifest.tracks.length === 0;
  // Styles with at least one emotion-selectable track; hidden while fewer
  // than two qualify.
  const stylesWithTracks =
    manifest?.styles.filter((s) => styleHasTracks(manifest, s.id)) ?? [];
  const activePlaylist = manifest ? findChopinPlaylist(manifest) : null;
  const playlistOn = view?.playlistOn ?? false;
  // Previous restarts the track with no history (including the current
  // playlist piece), so it stays on whenever a track is cued.
  const canPrev = view?.canPrev ?? false;
  const canSkip = view?.canSkip ?? false;

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
              replayNonce={view?.replayNonce ?? 0}
              fadeSec={view?.fadeSec ?? 0}
              canPrev={canPrev}
              onPrev={goPrev}
              canSkip={canSkip}
              onSkip={skip}
              volume={volume}
              muted={muted}
              onVolumeChange={changeVolume}
              onMutedChange={changeMuted}
              styles={stylesWithTracks}
              styleId={view?.style ?? null}
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
