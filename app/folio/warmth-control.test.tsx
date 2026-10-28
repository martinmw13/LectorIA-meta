// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { WARMTH_KEY, warmthStep } from "../warmth";
import { WarmthControl } from "./warmth-control";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  localStorage.clear();
  document.documentElement.style.removeProperty("--warmth");
  document.body.innerHTML = "";
});

async function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<WarmthControl />));
  return { root, input: host.querySelector<HTMLInputElement>('input[aria-label="Page warmth"]')! };
}

function setRange(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

test("warmth persists across remounts and sets --warmth", async () => {
  const first = await mount();
  expect(first.input.value).toBe("0");
  await act(async () => setRange(first.input, "3"));
  expect(localStorage.getItem(WARMTH_KEY)).toBe("3");
  expect(document.documentElement.style.getPropertyValue("--warmth")).toBe("1");
  expect(first.input.getAttribute("aria-valuetext")).toBe("Warmest");
  await act(async () => first.root.unmount());

  const second = await mount();
  expect(second.input.value).toBe("3");
});

test("bad stored values fall back to neutral", () => {
  for (const bad of [null, "", "4", "-1", "1.5", "warm"]) expect(warmthStep(bad)).toBe(0);
  expect(warmthStep("2")).toBe(2);
});
