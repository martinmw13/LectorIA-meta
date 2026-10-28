// @vitest-environment jsdom
// The loading slot must show the skin paper and status at once, and the
// ready image must render without waiting for the drawing to finish.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { ImagePane } from "./image-pane";
import type { SceneCard } from "./use-pictures";

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

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

test("loading shows the drawing and status, ready shows the image", () => {
  // No drawing progress: frames never fire, so nothing can block the flip.
  vi.stubGlobal("requestAnimationFrame", () => 0);
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
  const slot = host.querySelector('[role="status"]');
  expect(slot?.querySelector("svg.picdraw-art")).not.toBeNull();
  expect(slot?.textContent).toMatch("Etching the plate");
  expect(slot?.textContent).toMatch("twenty seconds");
  act(() => {
    root.render(<Harness card={{ phase: "ready", url: "https://img/x.jpg", caption: "Oz" }} />);
  });
  const img = host.querySelector("img.pane-img") as HTMLImageElement | null;
  expect(img?.getAttribute("src")).toBe("https://img/x.jpg");
  expect(host.querySelector("svg.picdraw-art")).toBeNull();
  act(() => {
    root.unmount();
  });
});
