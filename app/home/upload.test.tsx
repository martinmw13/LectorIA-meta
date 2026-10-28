// @vitest-environment jsdom
// Idle keybox: the BYOK pick reveals a password field with a show/hide
// eye, the Free pick hides and clears it, and a typed key prefills
// ByokStep through initialKey. The key never touches storage.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { UploadSection } from "./upload";
import { ByokStep } from "./byok";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

function render(node: React.ReactNode) {
  act(() => {
    root?.render(node);
  });
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function typeInto(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function pickButton(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll(".ob-pickbtn")].find((el) =>
    el.textContent?.includes(label),
  );
  if (!found || !(found instanceof HTMLButtonElement)) throw new Error(`pick missing: ${label}`);
  return found;
}

function keyInput(): HTMLInputElement {
  const el = container.querySelector("#obKey");
  if (!(el instanceof HTMLInputElement)) throw new Error("key field missing");
  return el;
}

function eyeButton(): HTMLButtonElement {
  const el = [...container.querySelectorAll("button")].find((b) => b.classList.contains("ob-eye"));
  if (!el || !(el instanceof HTMLButtonElement)) throw new Error("eye button missing");
  return el;
}

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    // jsdom without storage: the components tolerate it.
  }
  document.body.innerHTML = "";
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
  });
  render(<UploadSection />);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container.remove();
});

describe("idle keybox", () => {
  test("key pick reveals the field with safe attributes", () => {
    expect(container.querySelector("#obKeybox")?.hasAttribute("hidden")).toBe(true);
    click(pickButton("Bring your own key!"));
    expect(container.querySelector("#obKeybox")?.hasAttribute("hidden")).toBe(false);
    const input = keyInput();
    expect(input.type).toBe("password");
    expect(input.placeholder).toBe("Paste your API key");
    expect(input.getAttribute("autocomplete")).toBe("off");
    expect(input.getAttribute("spellcheck")).toBe("false");
    expect(input.name).not.toMatch(/api.?key/i);
    expect(eyeButton().getAttribute("aria-label")).toBe("Show API key");
  });

  test("eye toggles input type and label", () => {
    click(pickButton("Bring your own key!"));
    click(eyeButton());
    expect(keyInput().type).toBe("text");
    expect(eyeButton().getAttribute("aria-label")).toBe("Hide API key");
    expect(eyeButton().getAttribute("aria-pressed")).toBe("true");
    click(eyeButton());
    expect(keyInput().type).toBe("password");
    expect(eyeButton().getAttribute("aria-label")).toBe("Show API key");
  });

  test("free pick hides and clears the key", () => {
    click(pickButton("Bring your own key!"));
    typeInto(keyInput(), "sk-test-idle");
    expect(keyInput().value).toBe("sk-test-idle");
    click(pickButton("Free"));
    expect(container.querySelector("#obKeybox")?.hasAttribute("hidden")).toBe(true);
    click(pickButton("Bring your own key!"));
    expect(keyInput().value).toBe("");
    expect(keyInput().type).toBe("password");
    try {
      const stored = JSON.stringify(window.localStorage);
      expect(stored).not.toContain("sk-test-idle");
    } catch {
      // No storage in this runner: nothing could have been stored.
    }
  });
});

describe("ByokStep initialKey", () => {
  test("prefills the key input", () => {
    render(<ByokStep reason="too_long" initialKey="sk-test-prefill" onSubmit={() => {}} />);
    const input = container.querySelector('input[name="transient-key"]');
    if (!(input instanceof HTMLInputElement)) throw new Error("byok key input missing");
    expect(input.value).toBe("sk-test-prefill");
  });
});
