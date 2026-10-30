// @vitest-environment jsdom
// Phone picture entry: the reading column carries its own Picture this
// button, style picker and scene result while the image pane hides.
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
    lightbox: { item: null, open: () => {}, close: () => {} },
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
  await act(async () => {
    root.render(
      <NarrationProvider entries={[]} scenes={[{ id: "c1s1", ch: 1, startN: 1, endN: 1 }]}>
        <BookView model={modelFor()} initialSceneId="c1s1" panelsByChapter={[]} />
      </NarrationProvider>,
    );
  });
  return host;
}

test("the column carries a picture entry with style picker", async () => {
  cardState.card = { phase: "idle" };
  const host = await renderBook();
  const tools = host.querySelector(".read-pictools");
  expect(tools).not.toBeNull();
  const labels = [...tools!.querySelectorAll(".read-picbtn")].map((b) => b.textContent);
  expect(labels).toContain("Picture this scene");
  expect(tools!.querySelector(".style-picker select")).not.toBeNull();
  expect(tools!.querySelector(".genfig")).toBeNull();
});

test("the picture button illustrates the scene", async () => {
  cardState.card = { phase: "idle" };
  const host = await renderBook();
  const btn = [...host.querySelectorAll(".read-picbtn")].find((b) => b.textContent === "Picture this scene");
  expect(btn).toBeDefined();
  await act(async () => {
    (btn as HTMLButtonElement).click();
  });
  expect(illustrateScene).toHaveBeenCalledTimes(1);
});

test("a ready scene card renders inline in the column", async () => {
  cardState.card = { phase: "ready", url: "https://img/x.png", caption: "The cyclone" };
  const host = await renderBook();
  const fig = host.querySelector(".read-pictools .genfig");
  expect(fig).not.toBeNull();
  expect(fig!.textContent).toContain("The cyclone");
  expect(fig!.querySelector("img")?.getAttribute("src")).toBe("https://img/x.png");
});
