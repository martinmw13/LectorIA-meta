// @vitest-environment jsdom
// Reached chapters load their comic page; gated ones request nothing.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { DRAW_STATUS, PANELS_NOTE } from "./picture-draw-paths";
import { PanelsModal } from "./panels-modal";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PANELS = [
  { key: "c1s1", caption: "The gray prairie" },
  { key: "c1s2", caption: "The cyclone comes" },
];

function pendingFetch() {
  const waiting: ((body: unknown) => void)[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise((done) => waiting.push((body) => done({ json: async () => body })))),
  );
  return async (body: unknown) => {
    await act(async () => {
      waiting.shift()?.(body);
      await new Promise((r) => setTimeout(r, 0));
    });
  };
}

function mount(ch = 1, reachedCh = 1) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <PanelsModal
        ch={ch}
        chapterTitle="The Cyclone"
        panels={PANELS}
        bookId="oz"
        textVersion="v"
        pref={{ kind: "preset", id: "denslow" }}
        reachedCh={reachedCh}
        onClose={() => {}}
        onOpenArt={() => {}}
      />,
    );
  });
  return { host, root };
}

function postedBody(): unknown {
  const calls = vi.mocked(fetch).mock.calls;
  const init = calls[0]?.[1] as RequestInit;
  return JSON.parse(init.body as string);
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

test("a reached chapter shows the wait line, then the page and captions", async () => {
  const answer = pendingFetch();
  const { host, root } = mount(1, 2);
  try {
    expect(host.querySelector(".pic-wait-t")?.textContent).toBe(DRAW_STATUS.engraving);
    expect(host.querySelector(".pic-wait-n")?.textContent).toBe(PANELS_NOTE);
    expect(postedBody()).toMatchObject({ kind: "chapter", ch: 1, reachedCh: 2 });
    expect(host.querySelector(".panels-frame")).not.toBeNull();
    expect([...host.querySelectorAll(".panels-caps li")].map((li) => li.textContent)).toEqual([
      "The gray prairie",
      "The cyclone comes",
    ]);
    await answer({ status: "ready", url: "/ch1.png", caption: "Chapter 1, The Cyclone" });
    expect(host.querySelector(".panels-frame img")?.getAttribute("src")).toBe("/ch1.png");
    expect(host.querySelector(".pic-wait")).toBeNull();
    expect([...host.querySelectorAll(".panels-caps li")].map((li) => li.textContent)).toEqual([
      "The gray prairie",
      "The cyclone comes",
    ]);
  } finally {
    act(() => root.unmount());
  }
});

test("an unreached chapter requests nothing and hides the captions", () => {
  const fetchSpy = vi.fn().mockRejectedValue(new Error("must not be called"));
  vi.stubGlobal("fetch", fetchSpy);
  const { host, root } = mount(2, 1);
  try {
    expect(host.textContent).toContain("Read up to this chapter first.");
    expect(host.querySelector(".panels-caps")).toBeNull();
    expect(host.querySelector(".panels-frame")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
  }
});
