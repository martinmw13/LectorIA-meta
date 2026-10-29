// One comic page per chapter, requested in the reader's style. Session
// cache per chapter and style, so reopening never refetches.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MSG_FAILED } from "@/core/images";
import { requestStyleFields } from "../image-style";
import type { ImageStylePref } from "../image-style";
import { poll } from "./use-pictures";

export type ChapterPage =
  | { phase: "loading" }
  | { phase: "ready"; url: string; caption: string }
  | { phase: "error"; message: string };

const chapterCache = new Map<string, { url: string; caption: string }>();

function cacheKey(ch: number, pref: ImageStylePref): string {
  return `${ch}::${JSON.stringify(requestStyleFields(pref))}`;
}

export function useChapterPage({
  bookId,
  textVersion,
  ch,
  pref,
  reachedCh,
}: {
  bookId: string;
  textVersion: string;
  ch: number;
  pref: ImageStylePref;
  reachedCh: number;
}): { page: ChapterPage; retry: () => void } {
  const reached = ch <= reachedCh;
  // The style pref arrives as a fresh object each render and is read
  // through a ref, like use-pictures; the key string tracks its value.
  const prefRef = useRef(pref);
  prefRef.current = pref;
  const key = cacheKey(ch, pref);
  const [page, setPage] = useState<ChapterPage>(() => {
    const hit = chapterCache.get(key);
    return hit ? { phase: "ready", url: hit.url, caption: hit.caption } : { phase: "loading" };
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!reached) return;
    const hit = chapterCache.get(key);
    if (hit) {
      setPage({ phase: "ready", url: hit.url, caption: hit.caption });
      return;
    }
    setPage({ phase: "loading" });
    let cancelled = false;
    void poll({ kind: "chapter", bookId, textVersion, ch, reachedCh, ...requestStyleFields(prefRef.current) })
      .then(({ url, caption }) => {
        chapterCache.set(key, { url, caption });
        if (!cancelled) setPage({ phase: "ready", url, caption });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPage({ phase: "error", message: err instanceof Error ? err.message : MSG_FAILED });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, textVersion, ch, key, reachedCh, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { page, retry };
}
