// @vitest-environment jsdom
// Uploads read without chat: the launcher mounts for shelf books and
// stays out for u- ids, where chat on our key must not run.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Reader, type ChapterJump, type SlimScene } from "./reader";

vi.mock("next/navigation", () => ({ useParams: () => ({}) }));
vi.mock("./chat/reader-chat", () => ({
  ReaderChat: () => <div data-testid="reader-chat" />,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom's AbortSignal may lack the static timeout helper the manifest
// fetch uses; the stub only satisfies the call signature.
if (typeof AbortSignal.timeout !== "function") {
  AbortSignal.timeout = (() => new AbortController().signal) as typeof AbortSignal.timeout;
}

const SCENES: SlimScene[] = [{ id: "c1s1", ch: 1, startN: 1, endN: 2, emotion: null }];
const CHAPTERS: ChapterJump[] = [{ ch: 1, title: "One", firstSceneId: "c1s1" }];

let container: HTMLDivElement;
let root: Root | null = null;

async function renderReader(bookId: string) {
  await act(async () => {
    root?.render(
      <Reader
        bookId={bookId}
        scenes={SCENES}
        chapters={CHAPTERS}
        bookTitle="T"
        bookAuthor="A"
        narration={[]}
      >
        <div>story</div>
      </Reader>,
    );
  });
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ version: 2, tracks: [] }), { status: 200 })),
  );
  document.body.innerHTML = "";
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  act(() => {
    root?.unmount();
  });
  root = null;
  container.remove();
});

describe("reader chat gate", () => {
  test("mounts chat for a shelf book", async () => {
    await renderReader("oz");
    expect(container.querySelector('[data-testid="reader-chat"]')).toBeTruthy();
  });

  test("hides chat for an upload id", async () => {
    await renderReader("u-AAAAAAAAAAAAAAAAAAAAAA");
    expect(container.querySelector('[data-testid="reader-chat"]')).toBeNull();
    expect(container.textContent).toContain("story");
  });
});
