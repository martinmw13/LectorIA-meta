"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageResponse } from "@/core/images";
import { pickStartN } from "./picture-selection";
import type { ParaEntry } from "./picture-selection";

type Card =
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

// Companion panel: illustrates the selected passage or the current scene.
// The client sends ordinals and ids only, never text. The scene id comes
// from the route, never from a DOM scan.
export function PicturePanel({
  bookId,
  textVersion,
  sceneId,
}: {
  bookId: string;
  textVersion: string;
  sceneId: string;
}) {
  const [card, setCard] = useState<Card>({ phase: "idle" });
  const [selTop, setSelTop] = useState<number | null>(null);
  const [selLeft, setSelLeft] = useState<number | null>(null);
  const pollLeft = useRef(0);

  const request = useCallback(
    async (body: unknown) => {
      setCard({ phase: "loading" });
      pollLeft.current = POLL_MAX;
      for (;;) {
        let res: ImageResponse;
        try {
          res = await postImage(body);
        } catch {
          setCard({ phase: "error", message: "No se pudo generar la imagen. Vuelve a intentarlo." });
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
          setCard({
            phase: "error",
            message: "La imagen tarda más de lo esperado. Vuelve a intentarlo.",
          });
          return;
        }
        await new Promise((done) => setTimeout(done, POLL_MS));
      }
    },
    [],
  );

  useEffect(() => {
    const onChange = () => {
      const sel = window.getSelection();
      const book = document.querySelector("main.book");
      if (!sel || sel.isCollapsed || !book || !sel.rangeCount) {
        setSelTop(null);
        return;
      }
      if (!book.contains(sel.anchorNode) && !book.contains(sel.focusNode)) {
        setSelTop(null);
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      setSelTop(rect.top + window.scrollY - 44);
      setSelLeft(Math.min(rect.left + window.scrollX, window.scrollX + window.innerWidth - 220));
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);

  const illustratePassage = useCallback(() => {
    const sel = window.getSelection();
    const book = document.querySelector("main.book");
    if (!sel || !book) return;
    const entries: ParaEntry[] = [...book.querySelectorAll("p[id][data-n]")].map((el) => ({
      id: el.id,
      n: Number(el.getAttribute("data-n")),
    }));
    const n = pickStartN(entries, paraOf(sel.anchorNode)?.id ?? null, paraOf(sel.focusNode)?.id ?? null);
    setSelTop(null);
    if (n === null || !Number.isInteger(n)) return;
    void request({ kind: "passage", bookId, textVersion, n });
  }, [bookId, textVersion, request]);

  const illustrateScene = useCallback(() => {
    if (!sceneId) return;
    void request({ kind: "scene", bookId, textVersion, sceneId });
  }, [bookId, textVersion, sceneId, request]);

  return (
    <div className="picture">
      <button type="button" className="picture-scene" onClick={illustrateScene} aria-label="Ilustrar escena">
        Ilustrar escena
      </button>
      {card.phase === "ready" ? (
        <figure className="picture-card">
          <img src={card.url} alt={card.caption} className="picture-img" />
          <figcaption>
            {card.caption} <span className="picture-flag">{card.cached ? "Guardada" : "Nueva"}</span>
          </figcaption>
        </figure>
      ) : card.phase === "loading" ? (
        <div className="picture-loading" role="status" aria-label="Ilustrando">
          Ilustrando…
        </div>
      ) : card.phase === "error" ? (
        <p className="picture-error" role="alert">
          {card.message}
        </p>
      ) : null}
      <p className="picture-note">El chat llega más adelante.</p>
      {selTop !== null && selLeft !== null ? (
        <button
          type="button"
          className="picture-float"
          style={{ top: selTop, left: selLeft }}
          onClick={illustratePassage}
          aria-label="Ilustrar este pasaje"
        >
          Ilustrar este pasaje
        </button>
      ) : null}
    </div>
  );
}
