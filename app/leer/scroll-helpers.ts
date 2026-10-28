// Continuous-scroll helpers: pure scene picking, section jumps, and the
// narration auto-follow pause. No React, no listeners on scroll (the
// observer in book-view.tsx owns scroll position without layout reads).
export interface SceneVisibility {
  id: string;
  ratio: number;
}

// Current scene = the visible section with the largest intersection ratio.
// Ties keep document order, so the upper section wins at exact 50/50 and
// the id only changes once the lower one dominates. Null when nothing is
// visible; the caller keeps the previous id.
export function pickCurrentScene(order: string[], visible: Map<string, SceneVisibility>): string | null {
  let best: string | null = null;
  let bestRatio = 0;
  for (const id of order) {
    const entry = visible.get(id);
    const ratio = entry && entry.id === id ? entry.ratio : 0;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = id;
    }
  }
  return best;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// Scroll the scroller so the scene section sits at its top; a chapter's
// first scene lands on the chapter heading instead. Instant when
// smooth is false or the user prefers reduced motion. False when the
// section is missing. scrollIntoView also renders content-visibility
// sections on the way there.
export function scrollToSceneId(scroller: HTMLElement, sceneId: string, smooth = true): boolean {
  const el = scroller.querySelector(`[data-scene-id="${sceneId}"]`);
  if (!el || typeof el.scrollIntoView !== "function") return false;
  const block = el.closest?.(".chapter-block");
  const target = block && block.querySelector("[data-scene-id]") === el ? block : el;
  target.scrollIntoView({
    block: "start",
    behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto",
  });
  return true;
}

// Narration auto-follow pause: the last user-driven scroll moment per
// scroller. Listeners attach once per scroller and stay passive.
const lastUserScroll = new WeakMap<object, number>();

export function noteUserScroll(scroller: object, now: number = Date.now()): void {
  lastUserScroll.set(scroller, now);
  pendingTarget.delete(scroller);
}

export function attachFollowPause(scroller: HTMLElement): () => void {
  const mark = () => noteUserScroll(scroller);
  scroller.addEventListener("wheel", mark, { passive: true });
  scroller.addEventListener("touchstart", mark, { passive: true });
  window.addEventListener("keydown", mark);
  return () => {
    scroller.removeEventListener("wheel", mark);
    scroller.removeEventListener("touchstart", mark);
    window.removeEventListener("keydown", mark);
  };
}

// Keep the spoken word in a comfortable band (20% to 80% of the scroller
// viewport). Inside it nothing moves. Once the word leaves it, one scroll
// sets its line at 35% (smooth unless reduced motion). The band is judged
// against that scroll's target while it is in flight, so frames re-issue
// the same target instead of stacking scrolls. A box taller than the band
// follows its top only. Never within pauseMs of a user scroll. Returns
// true when it scrolled or a scroll is on its way.
const pendingTarget = new WeakMap<object, number>();

export function followIntoView(
  el: { getBoundingClientRect(): DOMRect },
  scroller: HTMLElement,
  now: number = Date.now(),
  pauseMs = 4000,
): boolean {
  const last = lastUserScroll.get(scroller) ?? Number.NEGATIVE_INFINITY;
  if (now - last < pauseMs) return false;
  const frame = scroller.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  let pending = pendingTarget.get(scroller);
  if (pending !== undefined && Math.abs(scroller.scrollTop - pending) < 2) {
    pendingTarget.delete(scroller);
    pending = undefined;
  }
  const contentTop = box.top - frame.top + scroller.scrollTop;
  const rel = contentTop - (pending ?? scroller.scrollTop);
  const tall = box.height >= frame.height * 0.6;
  if (rel >= frame.height * 0.2 && (tall || rel + box.height <= frame.height * 0.8)) return pending !== undefined;
  let target = Math.max(0, contentTop - frame.height * 0.35);
  const max = scroller.scrollHeight - scroller.clientHeight;
  if (Number.isFinite(max)) target = Math.min(target, max);
  if (typeof scroller.scrollTo === "function") {
    scroller.scrollTo({ top: target, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  } else {
    scroller.scrollTop = target;
  }
  pendingTarget.set(scroller, target);
  return true;
}
