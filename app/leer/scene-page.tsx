// One scene view: heading, reading column, pictures, vault, pager.
// Sub-page moves stay in client state; scene moves push a new route.
"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buildNavIndex, navReducer } from "@/core/reader";
import type { NavAction, SceneView } from "@/core/reader";
import { loadImageStylePref, saveImageStylePref } from "../image-style";
import type { ImageStylePref } from "../image-style";
import { BandPager, Divider } from "../folio/chrome";
import { ImagePane } from "../folio/image-pane";
import { InlineFigureView, SelectionPopover } from "../folio/inline-figures";
import { Lightbox } from "../folio/lightbox";
import { usePictures } from "../folio/use-pictures";
import type { InlineFigure } from "../folio/use-pictures";
import { PictureVault } from "../folio/vault";

// One-shot entry intent: set just before pushing the previous scene
// route, so the new page opens on its last sub-page. Client memory only,
// never the URL, so prerendered pages stay static and a direct URL load
// always starts at page 0.
let enterAtEnd = false;

// Set on every in-app scene push. The heading takes focus only when this
// is set, so first load shows no focus ring.
let hasNavigated = false;

function pulse(el: HTMLElement | null) {
  if (!el) return;
  el.classList.remove("pulse");
  void el.offsetWidth;
  el.classList.add("pulse");
  window.setTimeout(() => el.classList.remove("pulse"), 650);
}

// One scene view: sub-pages, keys, buttons, progress, chapter jump.
// Sub-page moves stay in client state; scene moves push a new route.
export function ScenePage({
  view,
  views,
  bookId,
  textVersion,
  bookIndex,
  bookTotal,
}: {
  view: SceneView;
  views: { sceneId: string; pages: number }[];
  bookId: string;
  textVersion: string;
  bookIndex: number;
  bookTotal: number;
}) {
  const pic = usePictures({ bookId, textVersion, sceneId: view.sceneId });
  const [pref, setPref] = useState<ImageStylePref>({ kind: "preset", id: "denslow" });
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
  const readColRef = useRef<HTMLDivElement | null>(null);
  const figEls = useRef(new Map<string, HTMLElement>());
  const sub = view.pages[page] ?? view.pages[0];
  const atStart = view.prevSceneId === null && page === 0;
  const atBookEnd = view.nextSceneId === null && page === lastPage;

  useEffect(() => {
    setPref(loadImageStylePref());
  }, []);

  function changePref(next: ImageStylePref) {
    setPref(next);
    saveImageStylePref(next);
  }

  const figsByN = useMemo(() => {
    const grouped = new Map<number, InlineFigure[]>();
    for (const fig of pic.figures) {
      const list = grouped.get(fig.endN) ?? [];
      list.push(fig);
      grouped.set(fig.endN, list);
    }
    return grouped;
  }, [pic.figures]);

  function pageOf(n: number): number {
    const found = view.pages.findIndex((p) => p.paragraphs.some((para) => para.n === n));
    return found;
  }

  function gotoFigure(fig: InlineFigure) {
    const at = pageOf(fig.endN);
    if (at < 0) return;
    setPage(at);
    readColRef.current?.scrollTo(0, 0);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = figEls.current.get(fig.id) ?? null;
        el?.scrollIntoView({ block: "nearest" });
        pulse(el);
      });
    });
  }

  function gotoScenePicture() {
    const img = document.querySelector(".img-pane .pane-img");
    pulse(img instanceof HTMLElement ? img : null);
  }

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
      readColRef.current?.scrollTo(0, 0);
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
    readColRef.current?.scrollTo(0, 0);
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

  return (
    <>
      <ImagePane
        card={pic.card}
        onPicture={() => pic.illustrateScene(pref)}
        onRetry={() => pic.illustrateScene(pref)}
        onClear={pic.clearScene}
        onOpen={pic.openLightbox}
      />
      <Divider />
      <div className="read-col" ref={readColRef} aria-label="Reading column">
        <div className="kicker">Chapter {view.ch}</div>
        <h1 className="chapter-title" id="scene-heading" ref={headingRef} tabIndex={-1}>
          {view.chapterTitle}
        </h1>
        <div className="scene-line">
          <span>
            Scene {view.k} of {view.n}
            {view.pages.length > 1 ? ` · Page ${page + 1} of ${view.pages.length}` : ""}
          </span>
        </div>
        <div
          className={`body-text${page === 0 ? " dropcap" : ""}`}
          ref={pic.viewRef}
        >
          {sub?.paragraphs.map((p, i, arr) => (
            <Fragment key={p.id}>
              <p id={p.id} data-n={p.n} data-cont={p.cont ? true : undefined}>
                {p.text}
              </p>
              {/* A figure for n lands after its last visible fragment. */}
              {(arr[i + 1]?.n !== p.n ? (figsByN.get(p.n) ?? []) : []).map((fig) => (
                <InlineFigureView
                  key={fig.id}
                  figure={fig}
                  onRemove={() => pic.removeFigure(fig.id)}
                  onRetry={() => pic.retryFigure(fig.id, pref)}
                  onOpen={pic.openLightbox}
                  refCb={(el) => {
                    if (el) figEls.current.set(fig.id, el);
                    else figEls.current.delete(fig.id);
                  }}
                />
              ))}
            </Fragment>
          ))}
          {pic.popover !== null ? (
            <SelectionPopover
              pos={pic.popover}
              popRef={pic.popRef}
              onPick={() => pic.illustratePassage(pref)}
            />
          ) : null}
        </div>
      </div>
      <PictureVault
        scene={pic.card.phase === "ready" ? { url: pic.card.url, caption: pic.card.caption } : null}
        figures={pic.figures}
        onGotoScene={gotoScenePicture}
        onGotoFigure={gotoFigure}
        onOpen={pic.openLightbox}
        pref={pref}
        onPrefChange={changePref}
      />
      <BandPager
        k={view.k}
        n={view.n}
        bookIndex={bookIndex}
        bookTotal={bookTotal}
        onPrev={goPrev}
        onNext={goNext}
        atStart={atStart}
        atBookEnd={atBookEnd}
      />
      <Lightbox item={pic.lightbox} onClose={pic.closeLightbox} />
    </>
  );
}
