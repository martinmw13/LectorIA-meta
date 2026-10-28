// @vitest-environment jsdom
// Loading shows the skin paper and status at once. Flipping to ready
// must freeze the drawing (no further rAF), show the image at once
// over the paper, and remove the drawing only after the image loads.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { ImagePane } from "./image-pane";
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
  const slot = host.querySelector('[role="status"]');
  expect(slot?.querySelector("svg.picdraw-art")).not.toBeNull();
  expect(slot?.textContent).toMatch("Etching the plate");
  expect(raf.mock.calls.length).toBeGreaterThan(0);

  // Ready: the image is present at once, over a frozen drawing.
  act(() => {
    root.render(<Harness card={{ phase: "ready", url: "https://img/x.jpg", caption: "Oz" }} />);
  });
  const callsAtReady = raf.mock.calls.length;
  const img = host.querySelector("img.pane-img") as HTMLImageElement | null;
  expect(img?.getAttribute("src")).toBe("https://img/x.jpg");
  expect(host.querySelector("svg.picdraw-art")).not.toBeNull();
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
