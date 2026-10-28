// Picture state for one scene: the pane card plus inline figures.
// The client sends ordinals and ids only, never text. Session caches
// survive sub-page and scene moves, so a shown picture never refetches.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MSG_FAILED, MSG_RETRY } from "@/core/images";
import type { ImageResponse } from "@/core/images";
import { requestStyleFields, styleCredit } from "../image-style";
import type { ImageStylePref } from "../image-style";
import { pickEndN, pickStartN } from "../picture-selection";
import type { ParaEntry } from "../picture-selection";

export type SceneCard =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; url: string; caption: string }
  | { phase: "error"; message: string };

export interface InlineFigure {
  id: string;
  phase: "loading" | "ready" | "error";
  url: string | null;
  quote: string;
  startN: number;
  endN: number;
  credit: string;
  message: string | null;
}

export interface LightboxItem {
  src: string;
  caption: string;
}

const POLL_MS = 3000;
const POLL_MAX = 40;

const sceneCache = new Map<string, { url: string; caption: string }>();

// Read-only view of the session cache for the panels grid. Never
// writes, so it cannot change picture behaviour.
export function getCachedScenePicture(sceneId: string): { url: string; caption: string } | null {
  const hit = sceneCache.get(sceneId);
  return hit ? { url: hit.url, caption: hit.caption } : null;
}
const figureCache = new Map<string, InlineFigure[]>();
let figureSeq = 1;

function paraOf(node: Node | null): Element | null {
  if (!node) return null;
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  return el?.closest?.("p[id]") ?? null;
}

async function postImage(body: unknown): Promise<ImageResponse> {
  const res = await fetch("/api/images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as ImageResponse;
}

async function poll(body: unknown): Promise<{ url: string; caption: string }> {
  let left = POLL_MAX;
  for (;;) {
    let res: ImageResponse;
    try {
      res = await postImage(body);
    } catch {
      throw new Error(MSG_FAILED);
    }
    if (res.status === "ready") return { url: res.url, caption: res.caption };
    if (res.status === "error") throw new Error(res.message);
    left -= 1;
    if (left <= 0) throw new Error(MSG_RETRY);
    await new Promise((done) => setTimeout(done, POLL_MS));
  }
}

export function usePictures({
  bookId,
  textVersion,
  sceneId,
}: {
  bookId: string;
  textVersion: string;
  sceneId: string;
}) {
  const [card, setCard] = useState<SceneCard>(() => {
    const hit = sceneCache.get(sceneId);
    return hit ? { phase: "ready", url: hit.url, caption: hit.caption } : { phase: "idle" };
  });
  const [figures, setFigures] = useState<InlineFigure[]>(() =>
    (figureCache.get(sceneId) ?? []).filter((f) => f.phase !== "loading"),
  );
  const [popover, setPopover] = useState<{ top: number; left: number } | null>(null);
  const [lightbox, setLightbox] = useState<LightboxItem | null>(null);
  const viewRef = useRef<HTMLDivElement | null>(null);
  const popRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(false);

  const hidePopover = useCallback(() => setPopover(null), []);

  const storeFigures = useCallback(
    (next: InlineFigure[] | ((prev: InlineFigure[]) => InlineFigure[])) => {
      setFigures((prev) => {
        const value = typeof next === "function" ? (next as (p: InlineFigure[]) => InlineFigure[])(prev) : next;
        figureCache.set(sceneId, value);
        return value;
      });
    },
    [sceneId],
  );

  const openLightbox = useCallback((src: string, caption: string, opener: HTMLElement | null) => {
    openerRef.current = opener;
    setLightbox({ src, caption });
  }, []);

  const closeLightbox = useCallback(() => {
    setLightbox(null);
    openerRef.current?.focus?.();
    openerRef.current = null;
  }, []);

  const illustrateScene = useCallback(
    (pref: ImageStylePref) => {
      if (!sceneId || busyRef.current || sceneCache.has(sceneId)) return;
      busyRef.current = true;
      setPopover(null);
      setCard({ phase: "loading" });
      void poll({ kind: "scene", bookId, textVersion, sceneId, ...requestStyleFields(pref) })
        .then(({ url, caption }) => {
          sceneCache.set(sceneId, { url, caption });
          setCard({ phase: "ready", url, caption });
        })
        .catch((err: unknown) => {
          setCard({ phase: "error", message: err instanceof Error ? err.message : MSG_FAILED });
        })
        .finally(() => {
          busyRef.current = false;
        });
    },
    [bookId, textVersion, sceneId],
  );

  const clearScene = useCallback(() => {
    sceneCache.delete(sceneId);
    setCard({ phase: "idle" });
  }, [sceneId]);

  const requestFigure = useCallback(
    (id: string, startN: number, quote: string, pref: ImageStylePref) => {
      busyRef.current = true;
      void poll({ kind: "passage", bookId, textVersion, n: startN, ...requestStyleFields(pref) })
        .then(({ url }) => {
          storeFigures((prev) =>
            prev.map((f) => (f.id === id ? { ...f, phase: "ready", url, message: null } : f)),
          );
        })
        .catch((err: unknown) => {
          storeFigures((prev) =>
            prev.map((f) =>
              f.id === id
                ? { ...f, phase: "error", message: err instanceof Error ? err.message : MSG_FAILED }
                : f,
            ),
          );
        })
        .finally(() => {
          busyRef.current = false;
        });
    },
    [bookId, textVersion, storeFigures],
  );

  const illustratePassage = useCallback(
    (pref: ImageStylePref) => {
      const view = viewRef.current;
      const sel = window.getSelection();
      if (!view || !sel || !sel.rangeCount || busyRef.current) return;
      const quote = sel.toString().trim();
      if (quote.length < 3) return;
      const entries: ParaEntry[] = [...view.querySelectorAll("p[id][data-n]")].map((el) => ({
        id: el.id,
        n: Number(el.getAttribute("data-n")),
      }));
      const startN = pickStartN(entries, paraOf(sel.anchorNode)?.id ?? null, paraOf(sel.focusNode)?.id ?? null);
      const endN = pickEndN(entries, paraOf(sel.anchorNode)?.id ?? null, paraOf(sel.focusNode)?.id ?? null);
      if (startN === null || endN === null) return;
      setPopover(null);
      sel.removeAllRanges();
      const id = `f${figureSeq++}`;
      const credit = styleCredit(requestStyleFields(pref));
      storeFigures((prev) => [
        ...prev,
        { id, phase: "loading", url: null, quote, startN, endN, credit, message: null },
      ]);
      requestFigure(id, startN, quote, pref);
    },
    [requestFigure, storeFigures],
  );

  const retryFigure = useCallback(
    (id: string, pref: ImageStylePref) => {
      if (busyRef.current) return;
      const found = figureCache.get(sceneId)?.find((f) => f.id === id);
      if (!found || found.phase !== "error") return;
      storeFigures((prev) => prev.map((f) => (f.id === id ? { ...f, phase: "loading", message: null } : f)));
      requestFigure(id, found.startN, found.quote, pref);
    },
    [requestFigure, storeFigures, sceneId],
  );

  const removeFigure = useCallback(
    (id: string) => {
      storeFigures((prev) => prev.filter((f) => f.id !== id));
    },
    [storeFigures],
  );

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    let frame = 0;
    const onMouseUp = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const sel = window.getSelection();
        const text = sel?.toString().trim() ?? "";
        if (!sel || sel.isCollapsed || text.length < 3 || !sel.rangeCount) {
          setPopover(null);
          return;
        }
        if (!view.contains(sel.anchorNode) || !view.contains(sel.focusNode)) {
          setPopover(null);
          return;
        }
        const box = sel.getRangeAt(0).getBoundingClientRect();
        const host = view.getBoundingClientRect();
        setPopover({
          top: box.top - host.top - 8,
          left: box.left - host.left + box.width / 2,
        });
      });
    };
    view.addEventListener("mouseup", onMouseUp);
    return () => {
      cancelAnimationFrame(frame);
      view.removeEventListener("mouseup", onMouseUp);
    };
  }, [sceneId]);

  useEffect(() => {
    if (!popover) return;
    const onDown = (event: MouseEvent) => {
      if (!popRef.current?.contains(event.target as Node | null)) setPopover(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPopover(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [popover]);

  return {
    card,
    figures,
    popover,
    viewRef,
    popRef,
    illustrateScene,
    illustratePassage,
    hidePopover,
    clearScene,
    removeFigure,
    retryFigure,
    lightbox,
    openLightbox,
    closeLightbox,
  };
}
