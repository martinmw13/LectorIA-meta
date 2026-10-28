// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { LEGACY_WARMTH_KEY, WARMTH_KEY, easeWarmth, loadWarmth, parseWarmth, warmthBand } from "../warmth";
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

test("a continuous warmth persists across remounts and sets the eased --warmth", async () => {
  const first = await mount();
  expect(first.input.step).toBe("0.01");
  await act(async () => setRange(first.input, "0.37"));
  expect(localStorage.getItem(WARMTH_KEY)).toBe("0.37");
  expect(Number(document.documentElement.style.getPropertyValue("--warmth"))).toBeCloseTo(0.37 ** 1.7, 5);
  expect(first.input.getAttribute("aria-valuetext")).toBe("Warm");
  await act(async () => first.root.unmount());

  const second = await mount();
  expect(second.input.value).toBe("0.37");
});

test("an old step index migrates once to the continuous value", () => {
  localStorage.setItem(LEGACY_WARMTH_KEY, "2");
  expect(loadWarmth(localStorage)).toBeCloseTo(2 / 3);
  expect(localStorage.getItem(LEGACY_WARMTH_KEY)).toBeNull();
  expect(Number(localStorage.getItem(WARMTH_KEY))).toBeCloseTo(2 / 3);
  localStorage.clear();
  localStorage.setItem(LEGACY_WARMTH_KEY, "junk");
  expect(loadWarmth(localStorage)).toBe(0);
});

test("parsing clamps, and the curve keeps the low end subtle", () => {
  for (const bad of [null, "", "warm", "NaN"]) expect(parseWarmth(bad)).toBe(0);
  expect(parseWarmth("1.5")).toBe(1);
  expect(parseWarmth("-1")).toBe(0);
  expect(easeWarmth(0.5)).toBeLessThan(0.35);
  expect(easeWarmth(1)).toBe(1);
  expect(warmthBand(0)).toBe("Neutral");
  expect(warmthBand(1)).toBe("Candlelight");
});
