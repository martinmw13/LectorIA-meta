"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { parseManifest, styleHasTracks } from "@/core/music";
import type { MusicManifest, PersistedMusicPrefs, SceneSignal } from "@/core/music";
import { EMOTIONS } from "@/core/types";
import { dispatch, findChopinPlaylist, startSession } from "@/core/music-session";
import type { MusicIntent, MusicSession, SessionView } from "@/core/music-session";
import { nextSceneEntry } from "@/core/reader";
import { DEFAULT_VOLUME, loadMusicPrefs, saveMusicPrefs } from "./music-prefs";
import { Player } from "./player";
import { THEME_KEY, TopLine } from "./folio/chrome";
import { DevPanel } from "./folio/dev-panel";

export interface SlimScene {
  id: string;
  ch: number;
  emotion: SceneSignal | null;
}

export interface ChapterJump {
  ch: number;
  title: string;
  firstSceneId: string;
}

const DEV_LABELS: Record<(typeof EMOTIONS)[number], string> = {
  calma: "calm",
  alegria: "joy",
  tristeza: "sadness",
  suspenso: "suspense",
  misterio: "mystery",
  aventura: "adventure",
  combate: "combat",
  asombro: "wonder",
};

// Client container: bridges the music session to React state. It cues
// music on scene entry only, from the route id. Sub-page moves never
// reach the session. Params can lag a render, so the last observed id
// is compared before every scene entry.
export function Reader({
  scenes,
  chapters,
  bookTitle,
  bookAuthor,
  children,
}: {
  scenes: SlimScene[];
  chapters: ChapterJump[];
  bookTitle: string;
  bookAuthor: string;
  children: React.ReactNode;
}) {
  const routeParams = useParams();
  const router = useRouter();
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
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [devOpen, setDevOpen] = useState(false);
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
    try {
      const stored = window.localStorage.getItem(THEME_KEY);
      if (stored === "light" || stored === "dark") {
        setTheme(stored);
      } else {
        setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
      }
    } catch {
      // The inline script already set a theme; keep the default.
    }
    if (new URLSearchParams(window.location.search).has("dev")) setDevOpen(true);
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

  // Developer view: Shift+D outside inputs, Escape closes.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (event.key === "Escape") {
        setDevOpen(false);
        return;
      }
      if (typing) return;
      if (event.shiftKey && (event.key === "D" || event.key === "d")) {
        event.preventDefault();
        setDevOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        window.localStorage.setItem(THEME_KEY, next);
      } catch {
        // The attribute already applies for the session.
      }
      return next;
    });
  }

  function jumpChapter(ch: number) {
    const found = chapters.find((c) => c.ch === ch);
    if (found) router.push(`/leer/${found.firstSceneId}`);
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

  const bookIndex = routeSceneId ? scenes.findIndex((s) => s.id === routeSceneId) : -1;
  const current = routeSceneId ? byId.get(routeSceneId) ?? null : null;
  const devBars = current
    ? EMOTIONS.map((id) => ({ label: DEV_LABELS[id], value: current.vector[id] ?? 0 }))
    : [];

  return (
    <div className="folio">
      <TopLine
        bookTitle={bookTitle}
        author={bookAuthor}
        ch={routeSceneId ? (scenes[bookIndex]?.ch ?? chapters[0]?.ch ?? 1) : 1}
        chaptersTotal={chapters.length}
        chapters={chapters}
        onJumpChapter={jumpChapter}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      {children}
      <div className="band-play">
        {musicFailed || empty ? (
          <p className="player-note">The music is resting. The book is all yours.</p>
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
      <DevPanel
        open={devOpen}
        onClose={() => setDevOpen(false)}
        sceneLabel={bookIndex >= 0 ? `scene ${bookIndex + 1} of ${scenes.length}` : "no scene"}
        bars={devBars}
        intensity={current?.intensity ?? null}
        tempo={current?.tempo ?? null}
        trackTitle={track?.title ?? "No track cued"}
      />
    </div>
  );
}
