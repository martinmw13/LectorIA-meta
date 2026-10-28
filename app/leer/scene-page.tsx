// One scene view: heading, reading column, pictures, vault, pager.
// Sub-page moves stay in client state; scene moves push a new route.
// The chapter cover and end page are sub-pages of their scene, so
// they never touch music state.
"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buildNavIndex, navReducer, subPageCount, subPageKind, textPageAt } from "@/core/reader";
import type { NavAction, SceneView } from "@/core/reader";
import { effectiveImageStylePref, loadImageStylePref, saveImageStylePref } from "../image-style";
import type { ImageStylePref } from "../image-style";
import { useSkin } from "../use-skin";
import { BandPager, Divider } from "../folio/chrome";
import { useNarration } from "../narration/context";
import { ReadMark, useReadSync } from "../narration/read-sync";
import { figuresAfter, groupFiguresByEndN, pageOfOrdinal } from "../folio/figure-placement";
import { ImagePane } from "../folio/image-pane";
import { InlineFigureView, SelectionPopover } from "../folio/inline-figures";
import { Lightbox } from "../folio/lightbox";
import { edges, readOnLabel, wheelTurn } from "../folio/scroll-turn";
import type { WheelTurnState } from "../folio/scroll-turn";
import { usePictures } from "../folio/use-pictures";
import type { InlineFigure } from "../folio/use-pictures";
import { PictureVault } from "../folio/vault";
import {
  chapterSetAside,
  coverTitleLong,
  markChapterEndReached,
  markChapterSetAside,
  markPanelsShownAnyway,
  panelsUnlocked,
} from "../folio/panels";
import type { ChapterPanel } from "../folio/panels";
import {
  BlurredThumbs,
  PanelsModal,
  PanelsOfferCard,
  PanelsQuietLink,
  SpoilerGateDialog,
} from "../folio/panels-modal";

// One-shot entry intent: set just before pushing the previous scene
// route, so the new page opens on its last sub-page. Client memory only,
// never the URL, so prerendered pages stay static and a direct URL load
// always starts at page 0.
let enterAtEnd = false;

// Survives scene remounts so one swipe never turns twice.
let wheelState: WheelTurnState = { acc: 0, lockedUntil: 0, lastAt: 0 };

// Set on every in-app scene push. The heading takes focus only when this
// is set, so first load shows no focus ring.
let hasNavigated = false;

// True when the wheel target sits inside a nested scroller (picture
// vault, player bar, modal grids): those scroll natively and never turn
// pages. The reading column itself is not a nested scroller.
function inNestedScroller(target: HTMLElement | null, readCol: HTMLElement | null): boolean {
  let el: HTMLElement | null = target;
  while (el !== null) {
    if (el !== readCol) {
      const overflowY = window.getComputedStyle(el).overflowY;
      if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) {
        return true;
      }
    }
    el = el.parentElement;
  }
  return false;
}

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
  panels,
  nextChapter,
}: {
  view: SceneView;
  views: { sceneId: string; pages: number }[];
  bookId: string;
  textVersion: string;
  bookIndex: number;
  bookTotal: number;
  panels: ChapterPanel[];
  nextChapter: { ch: number; firstSceneId: string } | null;
}) {
  const [storedPref, setStoredPref] = useState<ImageStylePref | null>(null);
  // Server render uses the default so hydration matches; the live skin
  // applies on mount via useSyncExternalStore.
  const skin = useSkin();
  const pref = effectiveImageStylePref(storedPref, skin);
  const pic = usePictures({ bookId, textVersion, sceneId: view.sceneId, pref });
  const router = useRouter();
  const index = useMemo(() => buildNavIndex(views), [views]);
  const cover = view.isChapterFirst;
  const end = view.isChapterLast;
  const coverLong = coverTitleLong(view.chapterTitle);
  const total = subPageCount(view.pages.length, cover, end);
  const lastPage = total - 1;
  const [page, setPage] = useState(() => {
    if (enterAtEnd) {
      enterAtEnd = false;
      return lastPage;
    }
    return 0;
  });
  const [panelsOpen, setPanelsOpen] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [offerAside, setOfferAside] = useState(() => chapterSetAside(view.ch));
  const gateOpener = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const readColRef = useRef<HTMLDivElement | null>(null);
  const bodyTextRef = useRef<HTMLDivElement | null>(null);
  const figEls = useRef(new Map<string, HTMLElement>());
  // Last hand navigation, for the auto-turn gate: the voice keeps
  // reading but never yanks the page within ~8 s of a manual move.
  const lastManualRef = useRef<number | null>(null);
  const narration = useNarration();
  const sceneStartN = view.pages[0]?.startN ?? 0;
  const sceneEndN = view.pages[view.pages.length - 1]?.endN ?? 0;

  useEffect(() => {
    narration.registerScene({ sceneId: view.sceneId, ch: view.ch, startN: sceneStartN, endN: sceneEndN });
  }, [narration, view.sceneId, view.ch, sceneStartN, sceneEndN]);

  // One node serves both the picture popover and the read-along mark.
  const viewRef = pic.viewRef;
  const setBodyText = useCallback(
    (node: HTMLDivElement | null) => {
      bodyTextRef.current = node;
      viewRef(node);
    },
    [viewRef],
  );
  const kind = subPageKind(page, view.pages.length, cover, end);
  const sub = kind === "text" ? (view.pages[textPageAt(page, cover)] ?? view.pages[0]) : undefined;
  const textIndex = textPageAt(page, cover);
  const atStart = view.prevSceneId === null && page === 0;
  const atBookEnd = view.nextSceneId === null && page === lastPage;
  const readOn =
    kind === "text"
      ? readOnLabel({
          textIndex,
          textCount: view.pages.length,
          hasEndPage: end,
          hasNextSceneInChapter: view.k < view.n,
          ch: view.ch,
        })
      : null;

  useEffect(() => {
    setStoredPref(loadImageStylePref());
  }, []);

  // The end page marks the chapter finished, unlocking the panels.
  useEffect(() => {
    if (kind === "end") markChapterEndReached(view.ch);
  }, [kind, view.ch]);

  function changePref(next: ImageStylePref) {
    setStoredPref(next);
    saveImageStylePref(next);
  }

  function requestPanels(opener: HTMLElement | null) {
    if (panelsUnlocked(view.ch)) {
      setPanelsOpen(true);
      return;
    }
    gateOpener.current = opener;
    setGateOpen(true);
  }

  function showAnyway() {
    markPanelsShownAnyway(view.ch);
    setGateOpen(false);
    setPanelsOpen(true);
  }

  function notYet() {
    setGateOpen(false);
    gateOpener.current?.focus?.();
    gateOpener.current = null;
  }

  function readFirst() {
    markChapterSetAside(view.ch);
    setOfferAside(true);
  }

  function goNextChapter() {
    if (!nextChapter) return;
    hasNavigated = true;
    router.push(`/leer/${nextChapter.firstSceneId}`);
  }

  const figsByN = useMemo(() => groupFiguresByEndN(pic.figures), [pic.figures]);

  function gotoFigure(fig: InlineFigure) {
    // Same clock the auto-turn gate reads; Date.now would pin it shut.
    lastManualRef.current = performance.now();
    const at = pageOfOrdinal(view.pages, fig.endN);
    if (at < 0) return;
    setPage(at + (cover ? 1 : 0));
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
    lastManualRef.current = performance.now();
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

  // Read-along follow: the voice turns the sub-page on its own, from
  // the cover too. This path never stamps a manual move, so the gate
  // lets it through; the mark only paints where its word is rendered.
  const syncEnabled = narration.on && narration.manifest !== null;
  const { mark, treatment } = useReadSync({
    enabled: syncEnabled,
    audioRef: narration.audioRef,
    manifest: narration.manifest,
    span: narration.span,
    containerRef: bodyTextRef,
    scrollerRef: readColRef,
    pages: view.pages,
    textPage: textIndex,
    onTurnPage: (textIndex) => {
      setPage(textIndex + (cover ? 1 : 0));
      readColRef.current?.scrollTo(0, 0);
    },
    lastManualRef,
  });

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
      } else if (
        event.key === " " ||
        event.key === "PageDown" ||
        event.key === "ArrowDown" ||
        event.key === "PageUp" ||
        event.key === "ArrowUp"
      ) {
        if (target !== null && target.tagName === "BUTTON") return;
        const forward =
          event.key === "PageDown" || event.key === "ArrowDown" || (event.key === " " && !event.shiftKey);
        event.preventDefault();
        const col = readColRef.current;
        if (col !== null) {
          const at = edges(col);
          if ((forward && !at.atBottom) || (!forward && !at.atTop)) {
            col.scrollBy({ top: (forward ? 1 : -1) * col.clientHeight * 0.85, behavior: "smooth" });
            return;
          }
        }
        if (forward) goNext();
        else goPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, view.sceneId, index, router]);

  // Wheel and trackpad turn pages: at a column edge, an accumulated swipe
  // calls goNext/goPrev. preventDefault only on a turn, so the column
  // keeps scrolling natively until it rests on its edge.
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (panelsOpen || gateOpen || pic.lightbox.item !== null) return;
      if (event.ctrlKey) return;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const readCol = readColRef.current;
      if (inNestedScroller(target, readCol)) return;
      const at = readCol === null ? { atTop: true, atBottom: true } : edges(readCol);
      const result = wheelTurn(wheelState, {
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        now: performance.now(),
        atTop: at.atTop,
        atBottom: at.atBottom,
      });
      wheelState = result.state;
      if (result.turn === "next") {
        event.preventDefault();
        goNext();
      } else if (result.turn === "prev") {
        event.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [page, view.sceneId, index, router, panelsOpen, gateOpen, pic.lightbox.item]);

  return (
    <>
      <ImagePane
        // The cover always shows the placeholder: nothing to picture yet,
        // and a cached scene picture would spoil the chapter.
        card={kind === "cover" ? { phase: "idle" } : pic.card}
        onPicture={() => pic.illustrateScene()}
        onRetry={() => pic.illustrateScene()}
        onClear={pic.clearScene}
        onOpen={pic.lightbox.open}
        bare={kind === "cover"}
        onPictureChapter={
          kind === "cover" ? null : kind === "end" ? () => setPanelsOpen(true) : requestPanels
        }
      />
      <Divider />
      <div className="read-col" ref={readColRef} aria-label="Reading column">
        {kind === "cover" ? (
          <>
            <div className="kicker">Chapter</div>
            <p className="cover-num" data-long={coverLong} aria-label={`Chapter ${view.ch}`}>
              {view.ch}
            </p>
            <h1
              className="chapter-title cover-title"
              data-long={coverLong}
              id="scene-heading"
              ref={headingRef}
              tabIndex={-1}
            >
              {view.chapterTitle}
            </h1>
            <hr className="cover-rule" />
            {offerAside ? (
              <PanelsQuietLink onOpen={requestPanels} />
            ) : (
              <PanelsOfferCard panels={panels} onShowAnyway={showAnyway} onReadFirst={readFirst} />
            )}
            <button type="button" className="cover-begin" onClick={goNext}>
              Begin the chapter →
            </button>
            <span className="read-on-hint">or just scroll</span>
          </>
        ) : kind === "end" ? (
          <>
            <div className="kicker">End of Chapter {view.ch}</div>
            <div className="end-card">
              <BlurredThumbs panels={panels} unblurredCount={Math.min(4, panels.length)} />
              <h2>Relive this chapter in panels</h2>
              <div className="panels-btns">
                <button type="button" className="panels-primary" onClick={() => setPanelsOpen(true)}>
                  Open the panels
                </button>
              </div>
            </div>
            {nextChapter ? (
              <button type="button" className="end-next" onClick={goNextChapter}>
                On to Chapter {nextChapter.ch} →
              </button>
            ) : (
              <p className="the-end">The end.</p>
            )}
          </>
        ) : (
          <>
            <div className="kicker">Chapter {view.ch}</div>
            <h1 className="chapter-title" id="scene-heading" ref={headingRef} tabIndex={-1}>
              {view.chapterTitle}
            </h1>
            <div className="scene-line">
              <span>
                Scene {view.k} of {view.n}
                {view.pages.length > 1 ? ` · Page ${textIndex + 1} of ${view.pages.length}` : ""}
              </span>
            </div>
            <div className={`body-text${textIndex === 0 ? " dropcap" : ""}`} ref={setBodyText}>
              <ReadMark mark={syncEnabled ? mark : null} treatment={treatment} />
              {sub?.paragraphs.map((p, i, arr) => (
                <Fragment key={p.id}>
                  <p id={p.id} data-n={p.n} data-cont={p.cont ? true : undefined} data-from={p.from ?? 0}>
                    {p.text}
                  </p>
                  {/* A figure for n lands after its last visible fragment. */}
                  {figuresAfter(arr, i, figsByN).map((fig) => (
                    <InlineFigureView
                      key={fig.id}
                      figure={fig}
                      onRemove={() => pic.removeFigure(fig.id)}
                      onRetry={() => pic.retryFigure(fig.id)}
                      onOpen={pic.lightbox.open}
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
                  onPick={() => pic.illustratePassage()}
                />
              ) : null}
              {/* Every read-on label ends with " ↓"; the arrow gets its own span for the hover nudge. */}
              {readOn !== null ? (
                <button type="button" className="read-on" onClick={goNext}>
                  {readOn.slice(0, -1)}
                  <span className="read-on-arrow" aria-hidden="true">
                    ↓
                  </span>
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
      <PictureVault
        scene={pic.card.phase === "ready" ? { url: pic.card.url, caption: pic.card.caption } : null}
        figures={pic.figures}
        onGotoScene={gotoScenePicture}
        onGotoFigure={gotoFigure}
        onOpen={pic.lightbox.open}
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
      <Lightbox item={pic.lightbox.item} onClose={pic.lightbox.close} />
      {gateOpen ? <SpoilerGateDialog onShow={showAnyway} onNotYet={notYet} /> : null}
      {panelsOpen ? (
        <PanelsModal
          ch={view.ch}
          chapterTitle={view.chapterTitle}
          panels={panels}
          onClose={() => setPanelsOpen(false)}
          onOpenArt={pic.lightbox.open}
        />
      ) : null}
    </>
  );
}
