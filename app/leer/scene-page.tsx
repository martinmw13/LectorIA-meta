"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buildNavIndex, navReducer } from "@/core/reader";
import type { NavAction, SceneView } from "@/core/reader";
import { PictureSlot, usePictureScene } from "../picture-panel";

export interface ChapterJump {
  ch: number;
  title: string;
  firstSceneId: string;
}

// One-shot entry intent: set just before pushing the previous scene
// route, so the new page opens on its last sub-page. Client memory only,
// never the URL, so prerendered pages stay static and a direct URL load
// always starts at page 0.
let enterAtEnd = false;

// Set on every in-app scene push. The heading takes focus only when this
// is set, so first load shows no focus ring.
let hasNavigated = false;

// One scene view: sub-pages, keys, buttons, progress, chapter jump.
// Sub-page moves stay in client state; scene moves push a new route.
export function ScenePage({
  view,
  chapters,
  views,
  bookId,
  textVersion,
}: {
  view: SceneView;
  chapters: ChapterJump[];
  views: { sceneId: string; pages: number }[];
  bookId: string;
  textVersion: string;
}) {
  const pic = usePictureScene({ bookId, textVersion, sceneId: view.sceneId });
  const router = useRouter();
  const index = useMemo(() => buildNavIndex(views), [views]);
  const lastPage = view.pages.length - 1;
  const [page, setPage] = useState(() => {
    if (enterAtEnd) {
      enterAtEnd = false;
      return lastPage;
    }
    return 0;
  });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const sub = view.pages[page] ?? view.pages[0];
  const atStart = view.prevSceneId === null && page === 0;
  const atBookEnd = view.nextSceneId === null && page === lastPage;

  // Every pager move runs through navReducer; a new scene id means a
  // route push, a same-scene result means a client sub-page move.
  function move(action: NavAction) {
    pic.hidePopover();
    const next = navReducer({ sceneId: view.sceneId, page }, action, index);
    if (next.sceneId !== view.sceneId) {
      hasNavigated = true;
      if (next.page > 0) enterAtEnd = true;
      router.push(`/leer/${next.sceneId}`);
      return;
    }
    if (next.page !== page) {
      setPage(next.page);
      window.scrollTo(0, 0);
    }
  }

  function goNext() {
    move({ kind: "next" });
  }

  function goPrev() {
    move({ kind: "prev" });
  }

  // Scene entry resets orientation; sub-page moves keep the heading.
  useEffect(() => {
    if (hasNavigated) headingRef.current?.focus();
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
  }, [page, view.sceneId, index, router]);

  function jumpChapter(ch: number) {
    const found = chapters.find((c) => c.ch === ch);
    if (found && found.firstSceneId !== view.sceneId) move({ kind: "goto", sceneId: found.firstSceneId });
  }

  return (
    <article aria-labelledby="scene-heading">
      <div className="scene-view" ref={pic.viewRef}>
        <p className="scene-progress">
          <span className="scene-progress-chapter">{`Chapter ${view.ch} · ${view.chapterTitle}`}</span>
          <span className="scene-progress-sep" aria-hidden="true">
            ·
          </span>
          <span>{`Scene ${view.k} of ${view.n}${view.pages.length > 1 ? ` · Page ${page + 1} of ${view.pages.length}` : ""}`}</span>
          <button
            type="button"
            className="picture-scene"
            onClick={pic.illustrateScene}
            aria-label="Picture scene"
          >
            Picture scene
          </button>
        </p>
        <h2 id="scene-heading" ref={headingRef} tabIndex={-1}>
          {view.title}
        </h2>
        <PictureSlot card={pic.card} onDismiss={pic.dismissCard} />
        {sub?.paragraphs.map((p) => (
          <p key={p.id} id={p.id} data-n={p.n}>
            {p.text}
          </p>
        ))}
        {pic.popover !== null ? (
          <button
            type="button"
            ref={pic.popRef}
            className="picture-float"
            style={{ top: pic.popover.top, left: pic.popover.left }}
            onClick={pic.illustratePassage}
            aria-label="Picture this"
          >
            Picture this
          </button>
        ) : null}
      </div>
      <nav className="scene-nav" aria-label="Scenes">
        <button type="button" onClick={goPrev} disabled={atStart} aria-label="Previous">
          Previous
        </button>
        <button type="button" onClick={goNext} disabled={atBookEnd} aria-label="Next">
          Next
        </button>
        <label className="scene-jump">
          Chapter
          <select value={view.ch} onChange={(e) => jumpChapter(Number(e.target.value))} aria-label="Chapter">
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
