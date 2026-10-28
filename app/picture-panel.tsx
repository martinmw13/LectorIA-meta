"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MSG_FAILED, MSG_RETRY } from "@/core/images";
import type { ImageResponse } from "@/core/images";
import { loadImageStyle } from "./image-style-prefs";
import { pickStartN } from "./picture-selection";
import type { ParaEntry } from "./picture-selection";

export type PictureCard =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; url: string; caption: string; cached: boolean }
  | { phase: "error"; message: string };

const POLL_MS = 3000;
const POLL_MAX = 40;

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

// Scene illustration state: the client sends ordinals and ids only,
// never text. The scene id comes from the route, never from a DOM scan.
// The image survives sub-page moves and clears on scene change because
// the scene view remounts per scene id.
export function usePictureScene({
  bookId,
  textVersion,
  sceneId,
}: {
  bookId: string;
  textVersion: string;
  sceneId: string;
}) {
  const [card, setCard] = useState<PictureCard>({ phase: "idle" });
  const [popover, setPopover] = useState<{ top: number; left: number } | null>(null);
  const viewRef = useRef<HTMLDivElement | null>(null);
  const popRef = useRef<HTMLButtonElement | null>(null);
  const pollLeft = useRef(0);

  const hidePopover = useCallback(() => setPopover(null), []);

  const request = useCallback(async (body: unknown) => {
    // One snapshot per request: every post of this request, including
    // pending re-polls, carries the same style, so one chapter uses one style.
    const style = loadImageStyle();
    const payload =
      style === null || typeof body !== "object" || body === null ? body : { ...body, style };
    setPopover(null);
    setCard({ phase: "loading" });
    pollLeft.current = POLL_MAX;
    for (;;) {
      let res: ImageResponse;
      try {
        res = await postImage(payload);
      } catch {
        setCard({ phase: "error", message: MSG_FAILED });
        return;
      }
      if (res.status === "ready") {
        setCard({ phase: "ready", url: res.url, caption: res.caption, cached: res.cached });
        return;
      }
      if (res.status === "error") {
        setCard({ phase: "error", message: res.message });
        return;
      }
      pollLeft.current -= 1;
      if (pollLeft.current <= 0) {
        setCard({ phase: "error", message: MSG_RETRY });
        return;
      }
      await new Promise((done) => setTimeout(done, POLL_MS));
    }
  }, []);

  const illustrateScene = useCallback(() => {
    if (!sceneId || card.phase === "loading") return;
    void request({ kind: "scene", bookId, textVersion, sceneId });
  }, [bookId, textVersion, sceneId, request, card.phase]);

  const illustratePassage = useCallback(() => {
    const view = viewRef.current;
    const sel = window.getSelection();
    if (!view || !sel || !sel.rangeCount) return;
    const entries: ParaEntry[] = [...view.querySelectorAll("p[id][data-n]")].map((el) => ({
      id: el.id,
      n: Number(el.getAttribute("data-n")),
    }));
    const n = pickStartN(entries, paraOf(sel.anchorNode)?.id ?? null, paraOf(sel.focusNode)?.id ?? null);
    if (n === null || !Number.isInteger(n) || card.phase === "loading") return;
    void request({ kind: "passage", bookId, textVersion, n });
  }, [bookId, textVersion, request, card.phase]);

  const dismissCard = useCallback(() => setCard({ phase: "idle" }), []);

  // "Picture this" popover: on mouseup, after a frame, show it above the
  // selection when the trimmed text is at least 3 chars inside the scene.
  // Hidden while an image loads.
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

  // Any mousedown outside the popover dismisses it, as does Escape.
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

  const loading = card.phase === "loading";
  return {
    card,
    popover: loading ? null : popover,
    viewRef,
    popRef,
    illustrateScene,
    illustratePassage,
    hidePopover,
    dismissCard,
  };
}

// Inline result slot under the scene heading: image, loading, and error
// share one place, with a dismiss button on the finished card.
export function PictureSlot({
  card,
  onDismiss,
}: {
  card: PictureCard;
  onDismiss: () => void;
}) {
  if (card.phase === "idle") return null;
  return (
    <div className="picture-slot">
      {card.phase === "ready" ? (
        <figure className="picture-card">
          <img src={card.url} alt={card.caption} className="picture-img" />
          <figcaption>
            {card.caption} <span className="picture-flag">{card.cached ? "Saved" : "New"}</span>
            <button
              type="button"
              className="picture-dismiss"
              onClick={onDismiss}
              aria-label="Dismiss image"
              title="Dismiss image"
            >
              ×
            </button>
          </figcaption>
        </figure>
      ) : card.phase === "loading" ? (
        <div className="picture-loading" role="status" aria-label="Illustrating">
          Illustrating…
        </div>
      ) : (
        <p className="picture-error" role="alert">
          {card.message}
        </p>
      )}
    </div>
  );
}
