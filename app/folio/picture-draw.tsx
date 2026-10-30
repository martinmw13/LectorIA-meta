// Skin-matched drawing shown while the picture loads. The parent keeps
// a frozen still mounted under the image until it loads, so the drawing
// stops the instant the card turns ready.
"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { PictureSkin } from "./picture-skin";
import { DRAW_NOTE, DRAW_STATUS, stillStrokes, strokesForSkin } from "./picture-draw-paths";
import { Paper, Tool } from "./picture-draw-tools";

function useReducedMotion(): boolean {
  // Start still so server HTML matches; the real value applies on mount.
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only media query read; initial true keeps SSR HTML matching
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

interface FlatStroke {
  d: string;
  stroke: string;
  width: number;
  opacity: number;
  fill?: string;
  blurred?: boolean;
}

export function usePictureLoaded(url: string) {
  // True once the ready image has actually loaded. The url sits next to
  // the flag so a cached ready-to-ready swap resets in the same render,
  // never flashing the new image as revealed.
  const [state, setState] = useState({ url, loaded: false });
  if (state.url !== url) setState({ url, loaded: false });
  // Derived, so even the resetting render reports the new url as waiting.
  const loaded = state.url === url && state.loaded;
  const imgRef = useCallback(
    (el: HTMLImageElement | null) => {
      if (el && el.complete && el.naturalWidth > 0)
        setState((s) => (s.url === url ? { ...s, loaded: true } : s));
    },
    [url],
  );
  // Late events from a previous image must not mark the new url loaded.
  const markLoaded = useCallback(
    () => setState((s) => (s.url === url ? { ...s, loaded: true } : s)),
    [url],
  );
  return { loaded, imgRef, markLoaded };
}

export function PictureDraw({ skin, frozen }: { skin: PictureSkin; frozen?: boolean }) {
  const reducedMotion = useReducedMotion();
  // Frozen (or reduced motion) renders the static still: no timers, no
  // rAF, so the drawing stops the instant the card turns ready.
  const stillMode = frozen || reducedMotion;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const grainId = `pdg${uid}`;
  const softId = `pds${uid}`;
  const toolRef = useRef<SVGGElement | null>(null);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  // Passes accumulate: outline first, then shading depth on top. When
  // the base passes run out, further light layers keep appending, so
  // the tool keeps working but nothing already drawn is ever wiped.
  const [strokes, setStrokes] = useState<FlatStroke[]>(() =>
    [0, 1, 2, 3].flatMap((l) => strokesForSkin(skin, l)),
  );
  const nextLayer = useRef(4);
  useEffect(() => {
    nextLayer.current = 4;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- skin change resets the animated strokes
    setStrokes([0, 1, 2, 3].flatMap((l) => strokesForSkin(skin, l)));
  }, [skin]);
  const strokesRef = useRef(strokes);
  // eslint-disable-next-line react-hooks/refs -- latest-strokes mirror for the rAF loop
  strokesRef.current = strokes;
  const stillAll = useMemo(() => stillStrokes(skin), [skin]);
  const still = stillMode ? stillAll : null;
  const flat = still ?? strokes;

  useEffect(() => {
    if (stillMode) return;
    const paths = pathRefs.current;
    const tool = toolRef.current;
    let dead = false;
    let frame = 0;
    const pos = { x: 340, y: 304 };
    const place = (x: number, y: number) => {
      pos.x = x;
      pos.y = y;
      tool?.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    };
    place(pos.x, pos.y);

    const pointAt = (p: SVGPathElement, f: number): { x: number; y: number } | null => {
      try {
        if (typeof p.getPointAtLength !== "function" || typeof p.getTotalLength !== "function") return null;
        const pt = p.getPointAtLength(p.getTotalLength() * f);
        return { x: pt.x, y: pt.y };
      } catch {
        return null;
      }
    };

    // Draw every stroke once, in order, and keep it: outline first,
    // then shading layers on top. Past the base passes, further light
    // layers append so the tool keeps working without ever wiping.
    let i = 0;
    const stepStroke = () => {
      if (dead) return;
      if (i >= strokesRef.current.length) {
        const layer = strokesForSkin(skin, nextLayer.current);
        nextLayer.current += 1;
        setStrokes((prev) => [...prev, ...layer]);
        let waits = 0;
        const poll = () => {
          if (dead) return;
          if ((pathRefs.current.length > i && pathRefs.current[i]) || waits++ > 120) stepStroke();
          else frame = requestAnimationFrame(poll);
        };
        frame = requestAnimationFrame(poll);
        return;
      }
      const el = paths[i];
      const spec = strokesRef.current[i];
      i += 1;
    if (!el || !spec) {
      stepStroke();
      return;
    }
    const dur = Math.min(1400, Math.max(150, spec.d.length * 3));
    const start = pointAt(el, 0);
    const t0 = performance.now();
    const TRAVEL = 100;
    const tick = (now: number) => {
      if (dead) return;
      if (now - t0 < TRAVEL) {
        if (start) {
          const k = (now - t0) / TRAVEL;
          place(pos.x + (start.x - pos.x) * k, pos.y + (start.y - pos.y) * k);
        }
        frame = requestAnimationFrame(tick);
        return;
      }
      const k = Math.min(1, (now - t0 - TRAVEL) / dur);
      if (spec.fill) {
        el.setAttribute("opacity", String(spec.opacity * k));
        if (k < 1) place(pos.x + Math.sin(k * 9) * 3, pos.y + Math.cos(k * 7) * 2);
      } else {
        el.setAttribute("opacity", String(spec.opacity));
        el.style.strokeDashoffset = String(1 - k);
        const pt = pointAt(el, k);
        if (pt) place(pt.x, pt.y);
      }
      if (k < 1) frame = requestAnimationFrame(tick);
      else stepStroke();
    };
    frame = requestAnimationFrame(tick);
  };
  stepStroke();
  return () => {
    dead = true;
    cancelAnimationFrame(frame);
  };
}, [stillMode, skin]);

  return (
    <svg
      className="picdraw-art"
      viewBox="0 0 300 380"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="Illustration being drawn"
    >
      <defs>
        <filter id={grainId} x="0" y="0" width="1" height="1">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
          <feColorMatrix values="0 0 0 0 .32 0 0 0 0 .25 0 0 0 0 .14 0 0 0 .10 0" />
        </filter>
        <filter id={softId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>
      <Paper skin={skin} grainId={grainId} />
      <g>
        {flat.map((s, i) => (
          <path
            key={i}
            ref={still ? undefined : (el) => {
              pathRefs.current[i] = el;
            }}
            d={s.d}
            fill={s.fill ?? "none"}
            stroke={s.stroke}
            strokeWidth={s.width || undefined}
            opacity={still ? s.opacity : 0}
            pathLength={s.fill ? undefined : 1}
            style={s.fill || still ? undefined : { strokeDasharray: "1", strokeDashoffset: "1" }}
            filter={s.blurred ? `url(#${softId})` : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </g>
      <g ref={toolRef} className="picdraw-tool" transform="translate(254 340)">
        <Tool skin={skin} />
      </g>
    </svg>
  );
}

// Waiting caption under the picture box, outside the frame.
export function PictureWait({ skin, as: Tag = "p", note = DRAW_NOTE }: { skin: PictureSkin; as?: "p" | "figcaption"; note?: string }) {
  return (
    <Tag className="pic-wait" data-picture-skin={skin} role="status">
      <span className="pic-wait-t">{DRAW_STATUS[skin]}</span>
      <span className="pic-wait-dots" aria-hidden="true"><i /><i /><i /></span>
      <span className="pic-wait-n">{note}</span>
    </Tag>
  );
}
