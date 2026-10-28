// Read-aloud controller: one dedicated audio element per reader mount,
// per-chapter manifests fetched lazily, duck signal for the music
// player. The element lives in the layout-level provider, so scrolling
// never interrupts playback. Play starts at the live scene (the scene
// under the reading line); pausing keeps the position, so pressing play
// again in the same scene resumes where it paused.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseChapterNarration, sceneSpan, type ChapterNarration } from "@/core/narration";
import { getCurrentSceneId } from "../leer/current-scene";
import {
  NARRATION_DUCK_DOWN_MS,
  NARRATION_DUCK_UP_MS,
  duckMultiplier,
  rampDuck,
} from "./duck";
import { DEFAULT_NARRATION_PREFS, loadNarrationPrefs, saveNarrationPrefs } from "./prefs";
import type { NarrationChapterEntry, NarrationPrefs, NarrationStatus } from "./types";

export interface NarrationSceneRef {
  id: string;
  ch: number;
  startN: number;
  endN: number;
}

function sameScene(a: NarrationSceneRef | null, b: NarrationSceneRef): boolean {
  return a !== null && a.id === b.id && a.ch === b.ch && a.startN === b.startN && a.endN === b.endN;
}

export function useNarrationController(opts: {
  entries: NarrationChapterEntry[];
  scenes: NarrationSceneRef[];
  musicLevel: number;
}) {
  const [prefs, setPrefs] = useState<NarrationPrefs>(DEFAULT_NARRATION_PREFS);
  const [status, setStatus] = useState<NarrationStatus>("idle");
  const [playing, setPlaying] = useState(false);
  const [duck, setDuck] = useState(1);
  const [scene, setScene] = useState<NarrationSceneRef | null>(null);
  const [manifest, setManifest] = useState<ChapterNarration | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cacheRef = useRef(new Map<number, ChapterNarration>());
  const entriesRef = useRef(opts.entries);
  entriesRef.current = opts.entries;
  const scenesRef = useRef(opts.scenes);
  scenesRef.current = opts.scenes;
  const musicRef = useRef(opts.musicLevel);
  musicRef.current = opts.musicLevel;
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const loadToken = useRef(0);
  const wantPlay = useRef(false);
  const duckRef = useRef(1);
  const pendingSeek = useRef<number | null>(null);
  const advancingRef = useRef(false);

  // Stored prefs apply after the server-matching first render.
  useEffect(() => {
    try {
      setPrefs(loadNarrationPrefs(window.localStorage));
    } catch {
      // Defaults already render; playback starts on user press.
    }
  }, []);

  function persist(next: NarrationPrefs) {
    setPrefs(next);
    try {
      saveNarrationPrefs(window.localStorage, next);
    } catch {
      // Private mode: playback continues without persistence.
    }
  }

  // Current chapter manifest: cache hit or a lazy fetch, parsed at the
  // trust boundary. Chapters map to src with .mp3 replaced by .json.
  useEffect(() => {
    if (!prefs.on || scene === null) {
      if (!prefs.on) {
        setStatus("idle");
        setManifest(null);
      }
      return;
    }
    const cached = cacheRef.current.get(scene.ch);
    if (cached) {
      setManifest(cached);
      setStatus("ready");
      return;
    }
    const token = (loadToken.current += 1);
    setStatus("loading");
    setManifest(null);
    const entry = entriesRef.current.find((e) => e.ch === scene.ch);
    if (!entry) {
      if (loadToken.current === token) {
        setStatus("error");
        wantPlay.current = false;
      }
      return;
    }
    fetch(entry.manifest)
      .then((res) => {
        if (!res.ok) throw new Error(`narration ${res.status}`);
        return res.json();
      })
      .then((json: unknown) => {
        if (loadToken.current !== token) return;
        const parsed = parseChapterNarration(json);
        cacheRef.current.set(scene.ch, parsed);
        setManifest(parsed);
        setStatus("ready");
      })
      .catch(() => {
        if (loadToken.current === token) {
          setStatus("error");
          wantPlay.current = false;
        }
      });
  }, [prefs.on, scene]);

  // Seek to the scene span, swapping chapter audio when needed. A fresh
  // src seeks on loadedmetadata; a kept src seeks at once.
  const seekScene = useCallback(() => {
    const audio = audioRef.current;
    const current = sceneRef.current;
    const heard = current !== null ? cacheRef.current.get(current.ch) : undefined;
    if (!audio || !current || !heard) return;
    const span = sceneSpan(heard, current.startN, current.endN);
    if (!span) return;
    if (audio.dataset.key !== heard.key) {
      pendingSeek.current = span.startSec;
      audio.dataset.key = heard.key;
      audio.src = heard.src;
    } else {
      try {
        audio.currentTime = span.startSec;
      } catch {
        pendingSeek.current = span.startSec;
      }
    }
  }, []);

  const playCurrent = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || sceneRef.current === null || cacheRef.current.get(sceneRef.current.ch) === undefined) {
      return;
    }
    seekScene();
    wantPlay.current = true;
    void audio.play().catch(() => {
      wantPlay.current = false;
    });
  }, [seekScene]);

  // Scene moves seek at once; playback resumes when the manifest lands.
  const prevSceneId = useRef<string | null>(null);
  useEffect(() => {
    if (scene !== null && prevSceneId.current !== scene.id) {
      prevSceneId.current = scene.id;
      advancingRef.current = false;
      if (cacheRef.current.get(scene.ch) !== undefined) {
        seekScene();
        if (wantPlay.current && prefsRef.current.on) playCurrent();
      }
    }
  }, [scene, manifest, seekScene, playCurrent]);

  // The want-to-play flag survives the manifest fetch.
  useEffect(() => {
    if (status === "ready" && wantPlay.current && prefs.on) playCurrent();
  }, [status, prefs.on, playCurrent]);

  // One audio element: play/pause mirror to state, the chapter end and
  // span end advance without user action, errors surface quietly.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onMeta = () => {
      if (pendingSeek.current !== null) {
        try {
          audio.currentTime = pendingSeek.current;
        } catch {
          // Past the end; the watchdog advances on timeupdate.
        }
        pendingSeek.current = null;
      }
    };
    const onTime = () => {
      const current = sceneRef.current;
      if (advancingRef.current || !current || audio.paused) return;
      const heard = cacheRef.current.get(current.ch);
      if (!heard) return;
      const span = sceneSpan(heard, current.startN, current.endN);
      if (span !== null && audio.currentTime >= span.endSec - 0.15) {
        advancingRef.current = true;
        const order = scenesRef.current;
        const at = order.findIndex((s) => s.id === current.id);
        const next = at >= 0 ? order[at + 1] : undefined;
        if (next === undefined) {
          wantPlay.current = false;
          audio.pause();
          advancingRef.current = false;
          return;
        }
        // The voice moves on by itself; the reader's scroll never steers it.
        setScene(next);
      }
    };
    const onEnded = () => {
      if (advancingRef.current) return;
      advancingRef.current = true;
      const current = sceneRef.current;
      const order = scenesRef.current;
      const at = current !== null ? order.findIndex((s) => s.id === current.id) : -1;
      const next = at >= 0 ? order[at + 1] : undefined;
      if (next === undefined) {
        wantPlay.current = false;
        advancingRef.current = false;
        return;
      }
      setScene(next);
    };
    const onError = () => {
      setStatus("error");
      wantPlay.current = false;
    };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, []);

  // Duck ramp: the music sits about 20 dB below the live voice level,
  // down fast when the voice starts, back up slow on pause. Pause, the
  // end of the book, errors, and switching off all restore the level.
  useEffect(() => {
    const target =
      prefs.on && playing ? duckMultiplier(musicRef.current, prefsRef.current.volume) : 1;
    if (duckRef.current === target) {
      setDuck(target);
      return;
    }
    const duration = target < duckRef.current ? NARRATION_DUCK_DOWN_MS : NARRATION_DUCK_UP_MS;
    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      const next = rampDuck(duckRef.current, target, now - prev, duration);
      prev = now;
      duckRef.current = next;
      setDuck(next);
      if (next !== target) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, prefs.on, prefs.volume, opts.musicLevel]);

  // The narration volume rides its own slider, never the music mute.
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.volume = prefs.volume;
      } catch {
        // A missing media engine keeps the slider harmless.
      }
    }
  }, [prefs.volume, status]);

  const registerScene = useCallback((next: NarrationSceneRef) => {
    setScene((prev) => (sameScene(prev, next) ? prev : next));
  }, []);

  // Press play at the live scene: the scene under the reading line, at
  // its span start — or where it paused when still in that scene. The
  // live scene keeps following scroll only; narration never sets it.
  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (playing) {
      wantPlay.current = false;
      audio?.pause();
      return;
    }
    if (!prefsRef.current.on) {
      persist({ on: true, volume: prefsRef.current.volume });
    }
    const order = scenesRef.current;
    const liveId = getCurrentSceneId();
    const found = liveId !== null ? order.find((s) => s.id === liveId) : undefined;
    const target = found ?? sceneRef.current ?? order[0] ?? null;
    if (target === null) {
      wantPlay.current = true;
      return;
    }
    if (!sameScene(sceneRef.current, target)) {
      setScene(target);
      wantPlay.current = true;
      return;
    }
    wantPlay.current = true;
    const heard = cacheRef.current.get(target.ch);
    if (audio && heard && audio.dataset.key === heard.key) {
      // Still positioned in this scene: resume where it paused.
      void audio.play().catch(() => {
        wantPlay.current = false;
      });
      return;
    }
    playCurrent();
  }, [playing, playCurrent]);

  const setVolume = useCallback(
    (volume: number) => {
      persist({ on: prefsRef.current.on, volume });
    },
    [],
  );

  const setOn = useCallback(
    (on: boolean) => {
      if (!on) {
        wantPlay.current = false;
        audioRef.current?.pause();
      }
      persist({ on, volume: prefsRef.current.volume });
      if (on) wantPlay.current = true;
    },
    [],
  );

  const span =
    scene !== null && manifest !== null ? sceneSpan(manifest, scene.startN, scene.endN) : null;

  return {
    audioRef,
    on: prefs.on,
    volume: prefs.volume,
    status,
    playing,
    duck,
    scene,
    manifest,
    span,
    registerScene,
    toggle,
    setVolume,
    setOn,
  };
}

export type NarrationController = ReturnType<typeof useNarrationController>;
