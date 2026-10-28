"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { SceneView } from "@/core/reader";

export interface ChapterJump {
  ch: number;
  title: string;
  firstSceneId: string;
}

// One scene view: sub-pages, keys, buttons, progress, chapter jump.
// Sub-page moves stay in client state; scene moves push a new route.
export function ScenePage({ view, chapters }: { view: SceneView; chapters: ChapterJump[] }) {
  const router = useRouter();
  const atEnd = useSearchParams().get("at") === "end";
  const [page, setPage] = useState(atEnd ? view.pages.length - 1 : 0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const lastPage = view.pages.length - 1;
  const sub = view.pages[page] ?? view.pages[0];
  const atStart = view.prevSceneId === null && page === 0;
  const atBookEnd = view.nextSceneId === null && page === lastPage;

  function goNext() {
    if (page < lastPage) {
      setPage(page + 1);
      window.scrollTo(0, 0);
      return;
    }
    if (view.nextSceneId) router.push(`/leer/${view.nextSceneId}`);
  }

  function goPrev() {
    if (page > 0) {
      setPage(page - 1);
      window.scrollTo(0, 0);
      return;
    }
    if (view.prevSceneId) router.push(`/leer/${view.prevSceneId}?at=end`);
  }

  // Scene entry resets orientation; sub-page moves keep the heading.
  useEffect(() => {
    headingRef.current?.focus();
    window.scrollTo(0, 0);
  }, [view.sceneId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function jumpChapter(ch: number) {
    const found = chapters.find((c) => c.ch === ch);
    if (found && found.firstSceneId !== view.sceneId) router.push(`/leer/${found.firstSceneId}`);
  }

  return (
    <article aria-labelledby="scene-heading">
      <div className="scene-view" key={`${view.sceneId}:${page}`}>
        <p className="scene-progress">
          Capítulo {view.ch}, {view.chapterTitle}. Escena {view.k} de {view.n}
          {view.pages.length > 1 ? `. Página ${page + 1} de ${view.pages.length}` : ""}
        </p>
        <h2 id="scene-heading" ref={headingRef} tabIndex={-1}>
          {view.title}
        </h2>
        {sub?.paragraphs.map((p) => (
          <p key={p.id} id={p.id} data-n={p.n}>
            {p.text}
          </p>
        ))}
      </div>
      <nav className="scene-nav" aria-label="Escenas">
        <button type="button" onClick={goPrev} disabled={atStart} aria-label="Anterior">
          Anterior
        </button>
        <button type="button" onClick={goNext} disabled={atBookEnd} aria-label="Siguiente">
          Siguiente
        </button>
        <label className="scene-jump">
          Capítulo
          <select value={view.ch} onChange={(e) => jumpChapter(Number(e.target.value))} aria-label="Capítulo">
            {chapters.map((c) => (
              <option key={c.ch} value={c.ch}>
                {c.ch}. {c.title}
              </option>
            ))}
          </select>
        </label>
      </nav>
    </article>
  );
}
