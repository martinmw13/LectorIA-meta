// @vitest-environment jsdom
// The voice picker stays hidden with a single voice and hands the
// chosen voice back on change.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { VoiceSelector } from "./voice-selector";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(voices: string[], voice: string, onChange: (voice: string) => void = () => {}): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<VoiceSelector voices={voices} voice={voice} onChange={onChange} />);
  });
  return host;
}

test("hides with one voice or none", () => {
  expect(render(["af_heart"], "af_heart").innerHTML).toBe("");
  document.body.innerHTML = "";
  expect(render([], "af_heart").innerHTML).toBe("");
  document.body.innerHTML = "";
});

test("shows the first chapter voice when the saved voice is missing", () => {
  const host = render(["af_heart", "am_michael"], "bm_george");
  expect(host.querySelector("select")!.value).toBe("af_heart");
  document.body.innerHTML = "";
});

test("lists the chapter voices and reports the choice", () => {
  const onChange = vi.fn();
  const host = render(["af_heart", "am_michael"], "af_heart", onChange);
  const select = host.querySelector("select")!;
  expect(select.getAttribute("aria-label")).toBe("Narration voice");
  expect([...select.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["Heart", "Michael"]);
  act(() => {
    select.value = "am_michael";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(onChange).toHaveBeenCalledWith("am_michael");
  document.body.innerHTML = "";
});

test("never offers retired voices even when a chapter still has them", () => {
  const host = render(["af_heart", "bf_emma", "am_michael", "bm_george"], "af_heart");
  expect([...host.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["Heart", "Michael"]);
  document.body.innerHTML = "";
});
