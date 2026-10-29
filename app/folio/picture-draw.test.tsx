// @vitest-environment jsdom
// Loading shows the skin paper and status at once. Flipping to ready
// must freeze the drawing (no further rAF), show the image at once
// over the paper, and remove the drawing only after the image loads.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { ImagePane } from "./image-pane";
import { usePictureLoaded } from "./picture-draw";
import { InlineFigureView } from "./inline-figures";
import type { SceneCard } from "./use-pictures";
import type { InlineFigure } from "./use-pictures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ card }: { card: SceneCard }) {
  return (
    <ImagePane
      card={card}
      onPicture={() => {}}
      onRetry={() => {}}
      onClear={() => {}}
      onOpen={() => {}}
    />
  );
}

function stubEnv(raf: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("requestAnimationFrame", raf);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function readyFigure(): InlineFigure {
  return {
    id: "f1",
    phase: "ready",
    url: "https://img/y.jpg",
    quote: "a little house",
    startN: 1,
    endN: 2,
    credit: "pic",
    message: null,
  };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("loading draws, ready freezes the drawing under the image until load", () => {
  const raf = vi.fn(() => 0);
  stubEnv(raf);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<Harness card={{ phase: "loading" }} />);
  });
  expect(host.querySelector("svg.picdraw-art")).not.toBeNull();
  expect(host.querySelector(".frame .pic-wait")).toBeNull();
  expect(host.querySelector(".img-pane > .pic-wait")?.textContent).toMatch("Etching the plate");
  expect(host.querySelector(".img-pane > .pic-wait")?.textContent).toMatch("about twenty seconds");
  expect(raf.mock.calls.length).toBeGreaterThan(0);

  // Ready: the image is present at once, over a frozen drawing.
  act(() => {
    root.render(<Harness card={{ phase: "ready", url: "https://img/x.jpg", caption: "Oz" }} />);
  });
  const callsAtReady = raf.mock.calls.length;
  const img = host.querySelector("img.pane-img") as HTMLImageElement | null;
  expect(img?.getAttribute("src")).toBe("https://img/x.jpg");
  expect(host.querySelector("svg.picdraw-art")).not.toBeNull();
  expect(host.querySelector(".pic-wait")).toBeNull();
  // Frozen: no drawing work after the flip, and no reveal before load.
  expect(raf.mock.calls.length).toBe(callsAtReady);
  expect(img?.className).not.toMatch(/rv-/);
  act(() => {
    root.render(<Harness card={{ phase: "ready", url: "https://img/x.jpg", caption: "Oz" }} />);
  });
  expect(raf.mock.calls.length).toBe(callsAtReady);

  // Loaded: the reveal plays and the drawing is gone.
  act(() => {
    img?.dispatchEvent(new Event("load"));
  });
  expect(host.querySelector("svg.picdraw-art")).toBeNull();
  expect(host.querySelector("img.pane-img")?.className).toMatch(/rv-engraving/);
  act(() => {
    root.unmount();
  });
});

// Passes accumulate: time only reveals more strokes and appends layers,
// so a drawn stroke never returns to hidden.
test("drawing passes accumulate and never wipe", () => {
  let now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const queue: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    queue.push(cb);
    return queue.length;
  });
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<Harness card={{ phase: "loading" }} />);
  });
  const dash = () =>
    [...host.querySelectorAll("svg.picdraw-art path")].map(
      (p) => (p as SVGPathElement).style.strokeDashoffset,
    );
  const step = (n: number) => {
    act(() => {
      for (let i = 0; i < n && queue.length > 0; i++) {
        now += 32;
        queue.splice(0).forEach((cb) => cb(now));
      }
    });
  };
  step(120);
  const pathsFirst = dash().length;
  const first = dash().filter((d) => d === "0").length;
  expect(first).toBeGreaterThan(0);
  const snap = dash();
  step(3000);
  const later = dash();
  expect(later.filter((d) => d === "0").length).toBeGreaterThanOrEqual(first);
  expect(later.length).toBeGreaterThanOrEqual(pathsFirst);
  snap.forEach((d, i) => {
    if (d === "0") expect(later[i]).toBe("0");
  });
  act(() => {
    root.unmount();
  });
});

// Reduced motion renders the static still with no rAF past mount; the
// loaded image takes the reveal class, which the stylesheet maps to the
// 200 ms fade under prefers-reduced-motion.
test("reduced motion is static with the short fade", () => {
  const raf = vi.fn(() => 0);
  vi.stubGlobal("requestAnimationFrame", raf);
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<Harness card={{ phase: "loading" }} />);
  });
  expect(host.querySelector("svg.picdraw-art")).not.toBeNull();
  expect(raf.mock.calls.length).toBe(0);
  act(() => {
    root.render(<Harness card={{ phase: "ready", url: "https://img/r.jpg", caption: "Oz" }} />);
  });
  const img = host.querySelector("img.pane-img") as HTMLImageElement | null;
  expect(img?.className).not.toMatch(/rv-/);
  expect(host.querySelector("svg.picdraw-art")).not.toBeNull();
  expect(raf.mock.calls.length).toBe(0);
  act(() => {
    img?.dispatchEvent(new Event("load"));
  });
  expect(host.querySelector("svg.picdraw-art")).toBeNull();
  expect(host.querySelector("img.pane-img")?.className).toMatch(/rv-engraving/);
  expect(raf.mock.calls.length).toBe(0);
  act(() => {
    root.unmount();
  });
});

// A cached revisit swaps ready urls without passing through loading: the
// new image must wait for its own load, never flash as revealed. The
// probe records every render, so an effect-only reset still shows the
// one frame where the new url reads as loaded.
test("a ready url swap never shows the new image as revealed", () => {
  const raf = vi.fn(() => 0);
  stubEnv(raf);
  const seen: { url: string; loaded: boolean }[] = [];
  let mark: () => void = () => {};
  function LoadedProbe({ url }: { url: string }) {
    const { loaded, markLoaded } = usePictureLoaded(url);
    mark = markLoaded;
    seen.push({ url, loaded });
    return null;
  }
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<LoadedProbe url="https://img/a.jpg" />);
  });
  act(() => {
    mark();
  });
  expect(seen.at(-1)).toEqual({ url: "https://img/a.jpg", loaded: true });
  act(() => {
    root.render(<LoadedProbe url="https://img/b.jpg" />);
  });
  // The render-phase reset may render twice; what matters is no frame
  // ever shows the new url as loaded.
  const bRenders = seen.filter((s) => s.url === "https://img/b.jpg");
  expect(bRenders.length).toBeGreaterThan(0);
  expect(bRenders.every((s) => s.loaded === false)).toBe(true);

  // End to end: after the swap the pane waits for the new load.
  act(() => {
    root.render(<Harness card={{ phase: "ready", url: "https://img/a.jpg", caption: "A" }} />);
  });
  const first = host.querySelector("img.pane-img") as HTMLImageElement | null;
  act(() => {
    first?.dispatchEvent(new Event("load"));
  });
  expect(host.querySelector("img.pane-img")?.className).toMatch(/rv-/);
  const callsAtReady = raf.mock.calls.length;
  act(() => {
    root.render(<Harness card={{ phase: "ready", url: "https://img/b.jpg", caption: "B" }} />);
  });
  const second = host.querySelector("img.pane-img") as HTMLImageElement | null;
  expect(second?.getAttribute("src")).toBe("https://img/b.jpg");
  expect(second?.className).not.toMatch(/rv-/);
  expect(host.querySelector("svg.picdraw-art")).not.toBeNull();
  expect(raf.mock.calls.length).toBe(callsAtReady);
  act(() => {
    second?.dispatchEvent(new Event("load"));
  });
  expect(host.querySelector("svg.picdraw-art")).toBeNull();
  expect(host.querySelector("img.pane-img")?.className).toMatch(/rv-/);
  act(() => {
    root.unmount();
  });
});

test("inline ready figure keeps the frozen drawing until the image loads", () => {
  const raf = vi.fn(() => 0);
  stubEnv(raf);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <InlineFigureView
        figure={readyFigure()}
        onRemove={() => {}}
        onRetry={() => {}}
        onOpen={() => {}}
        refCb={() => {}}
      />,
    );
  });
  const img = host.querySelector("img.gen-ready") as HTMLImageElement | null;
  expect(img?.getAttribute("src")).toBe("https://img/y.jpg");
  expect(host.querySelector("svg.picdraw-art")).not.toBeNull();
  act(() => {
    img?.dispatchEvent(new Event("load"));
  });
  expect(host.querySelector("svg.picdraw-art")).toBeNull();
  expect(host.querySelector("img.gen-ready")?.className).toMatch(/rv-engraving/);
  act(() => {
    root.unmount();
  });
});
