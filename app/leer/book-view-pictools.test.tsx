// @vitest-environment jsdom
// Phone picture entry: the reading column carries its own Picture this
// button and style picker in a sticky bar. The finished scene opens in
// the lightbox; loading and error show as a status line, never as an
// inline figure at the top of the book.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ReaderModel } from "@/core/reader";
import { NarrationProvider } from "../narration/context";
import { BookView } from "./book-view";
import type { SceneCard } from "../folio/use-pictures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cardState: { card: SceneCard } = { card: { phase: "idle" } };
const illustrateScene = vi.fn();
const openLightbox = vi.fn();

vi.mock("../folio/use-pictures", () => ({
  poll: () => new Promise(() => {}),
  usePictures: () => ({
    card: cardState.card,
    needHuman: false,
    submitHumanPass: () => {},
    figures: [],
    popover: null,
    viewRef: () => {},
    popRef: { current: null },
    illustrateScene,
    illustratePassage: () => {},
    hidePopover: () => {},
    rescan: () => {},
    clearScene: () => {},
    removeFigure: () => {},
    retryFigure: () => {},
    lightbox: { item: null, open: openLightbox, close: () => {} },
  }),
}));

function modelFor(): ReaderModel {
  return {
    bookId: "oz",
    textVersion: "v",
    title: "T",
    author: "A",
    chapters: [
      {
        ch: 1,
        title: "One",
        scenes: [{ id: "c1s1", title: "S1", paragraphs: [{ id: "p1", n: 1, text: "Hello world." }] }],
      },
    ],
  } as unknown as ReaderModel;
}

const roots: Root[] = [];
beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("no network in pictools test");
    }),
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} })),
  );
});
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

async function renderBook() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  const draw = () =>
    root.render(
      <NarrationProvider entries={[]} scenes={[{ id: "c1s1", ch: 1, startN: 1, endN: 1 }]}>
        <BookView model={modelFor()} initialSceneId="c1s1" panelsByChapter={[]} />
      </NarrationProvider>,
    );
  await act(async () => {
    draw();
  });
  return {
    host,
    rerender: () => act(async () => draw()),
  };
}

function narrow(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches, addEventListener: () => {}, removeEventListener: () => {} })),
  );
}

test("the column carries a picture entry with style picker", async () => {
  cardState.card = { phase: "idle" };
  const { host } = await renderBook();
  const tools = host.querySelector(".read-pictools");
  expect(tools).not.toBeNull();
  const labels = [...tools!.querySelectorAll(".read-picbtn")].map((b) => b.textContent);
  expect(labels).toContain("Picture this scene");
  expect(tools!.querySelector(".style-picker select")).not.toBeNull();
  expect(tools!.querySelector(".genfig")).toBeNull();
});

test("the picture button illustrates the scene", async () => {
  cardState.card = { phase: "idle" };
  const { host } = await renderBook();
  const btn = [...host.querySelectorAll(".read-picbtn")].find((b) => b.textContent === "Picture this scene");
  expect(btn).toBeDefined();
  await act(async () => {
    (btn as HTMLButtonElement).click();
  });
  expect(illustrateScene).toHaveBeenCalledTimes(1);
});

test("a ready scene opens in the lightbox, not as an inline figure", async () => {
  narrow(true);
  openLightbox.mockClear();
  cardState.card = { phase: "loading" };
  const { host, rerender } = await renderBook();
  cardState.card = { phase: "ready", url: "https://img/x.png", caption: "The cyclone" };
  await rerender();
  expect(openLightbox).toHaveBeenCalledWith("https://img/x.png", "The cyclone", null);
  expect(host.querySelector(".read-pictools .genfig")).toBeNull();
  expect(host.querySelector(".read-picstatus")).toBeNull();
});

test("a cached ready scene on entry stays quiet", async () => {
  narrow(true);
  openLightbox.mockClear();
  cardState.card = { phase: "ready", url: "https://img/x.png", caption: "The cyclone" };
  const { host } = await renderBook();
  expect(openLightbox).not.toHaveBeenCalled();
  expect(host.querySelector(".read-pictools .genfig")).toBeNull();
});

test("a ready scene stays out of the lightbox on desktop", async () => {
  narrow(false);
  openLightbox.mockClear();
  cardState.card = { phase: "loading" };
  const { rerender } = await renderBook();
  cardState.card = { phase: "ready", url: "https://img/x.png", caption: "The cyclone" };
  await rerender();
  expect(openLightbox).not.toHaveBeenCalled();
});

test("loading shows a polite status line in the bar", async () => {
  cardState.card = { phase: "loading" };
  const { host } = await renderBook();
  const status = host.querySelector(".read-pictools .read-picstatus");
  expect(status).not.toBeNull();
  expect(status!.getAttribute("aria-live")).toBe("polite");
  expect(status!.textContent).toMatch(/painting your scene/i);
  expect(host.querySelector(".read-pictools .genfig")).toBeNull();
});

test("an error shows its message with a retry", async () => {
  cardState.card = { phase: "error", message: "That picture didn't come out. Try again?" };
  const { host } = await renderBook();
  const status = host.querySelector(".read-pictools .read-picstatus");
  expect(status).not.toBeNull();
  expect(status!.getAttribute("aria-live")).toBe("polite");
  expect(status!.textContent).toContain("That picture didn't come out. Try again?");
  const retry = status!.querySelector("button");
  expect(retry?.textContent).toBe("Try again");
  illustrateScene.mockClear();
  await act(async () => {
    retry!.click();
  });
  expect(illustrateScene).toHaveBeenCalledTimes(1);
  expect(host.querySelector(".read-pictools .genfig")).toBeNull();
});
