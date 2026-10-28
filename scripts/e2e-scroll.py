"""Opt-in end-to-end check for wheel/trackpad/keyboard page turns (not run in CI).

Usage: python3 scripts/e2e-scroll.py [base_url]  (default http://localhost:3000)
Browser: $CHROME_PATH when set, else Playwright's bundled Chromium.
Needs Python Playwright; when it is not importable this prints a skip and exits 0.
Exits 1 with a clear message on the first failed assertion.

At 1440x900 and 1280x800 it asserts:
(a) trackpad-style swipes from /leer/c1s1 advance exactly one page each
    (every swipe yields a new, never-repeated label) and reach c2s1
    within 20 swipes;
(b) Space, PageDown and ArrowDown each advance a page and PageUp goes back;
(c) no page errors;
(d) after arriving at c2s1 by wheel, #scene-heading has computed
    outline-style "none" (or outline-width 0px).
"""

import os
import sys

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("skip: python playwright is not installed (pip install playwright)")
    sys.exit(0)

VIEWPORTS = [(1440, 900), (1280, 800)]
MAX_SWIPES = 20


def fail(msg):
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def scene_of(page):
    return page.url.rstrip("/").split("/")[-1].split("?")[0].split("#")[0]


def label(page):
    if page.locator(".scene-line").count():
        text = page.locator(".scene-line").first.inner_text()
    elif page.locator(".kicker").count():
        text = page.locator(".kicker").first.inner_text()
    else:
        text = ""
    return (scene_of(page), " ".join(text.split()))


def swipe(page):
    # Trackpad-like swipe: 40 decaying wheel events, 16ms apart (inertia).
    for i in range(40):
        page.mouse.wheel(0, max(2, int(60 * (0.92**i))))
        page.wait_for_timeout(16)
    page.wait_for_timeout(500)


def press_advance(page, key, prev, tag):
    # Space/Page/arrow keys scroll tall columns before turning, so allow
    # a few presses; the key must still move to a new page.
    for _ in range(3):
        page.keyboard.press(key)
        page.wait_for_timeout(700)
        now = label(page)
        if now != prev:
            return now
    fail(f"[{tag}] {key} did not advance after 3 presses (stuck at {prev})")


def check_viewport(browser, base, w, h):
    tag = f"{w}x{h}"
    page = browser.new_page(viewport={"width": w, "height": h})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    try:
        # (a) wheel sweep from the chapter-1 cover to chapter 2.
        page.goto(f"{base}/leer/c1s1", wait_until="networkidle")
        page.wait_for_timeout(1000)
        if scene_of(page) != "c1s1":
            fail(f"[{tag}] expected to start at /leer/c1s1, got {page.url}")
        seen = [label(page)]
        page.mouse.move(w * 0.55, h * 0.4)
        for n in range(1, MAX_SWIPES + 1):
            swipe(page)
            now = label(page)
            if now == seen[-1]:
                fail(f"[{tag}] swipe {n}: page did not change (stuck at {now})")
            if now in seen:
                fail(f"[{tag}] swipe {n}: label repeated {now} (one new page per swipe)")
            seen.append(now)
            if scene_of(page) == "c2s1":
                break
        else:
            fail(f"[{tag}] did not reach c2s1 within {MAX_SWIPES} swipes (at {seen[-1]})")
        print(f"[{tag}] swipes ok: {len(seen) - 1} swipes from c1s1 to c2s1")

        # (d) heading shows no focus ring after wheel arrival.
        outline = page.evaluate(
            "() => { const el = document.querySelector('#scene-heading');"
            " if (!el) return null;"
            " const s = getComputedStyle(el);"
            " return { style: s.outlineStyle, width: s.outlineWidth }; }"
        )
        if outline is None:
            fail(f"[{tag}] #scene-heading missing after arriving at c2s1")
        if outline["style"] != "none" and outline["width"] != "0px":
            fail(f"[{tag}] #scene-heading outline not removed: {outline}")
        print(f"[{tag}] heading outline ok: {outline}")

        # (b) keys on a fresh load.
        page.goto(f"{base}/leer/c1s1", wait_until="networkidle")
        page.wait_for_timeout(800)
        start = label(page)
        after_space = press_advance(page, "Space", start, tag)
        after_pgdn = press_advance(page, "PageDown", after_space, tag)
        after_down = press_advance(page, "ArrowDown", after_pgdn, tag)
        back = after_pgdn
        for _ in range(3):
            page.keyboard.press("PageUp")
            page.wait_for_timeout(700)
            if label(page) == back:
                break
        else:
            fail(f"[{tag}] PageUp did not go back to {back} (at {label(page)})")
        print(f"[{tag}] keys ok: Space/PageDown/ArrowDown advance, PageUp goes back")

        # (c) no page errors across both loads.
        if errors:
            fail(f"[{tag}] {len(errors)} page error(s), first: {errors[0]}")
        print(f"[{tag}] no page errors")
    finally:
        page.close()


def main():
    if len(sys.argv) > 1 and sys.argv[1] in ("-h", "--help"):
        print("usage: python3 scripts/e2e-scroll.py [base_url]")
        return
    base = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://localhost:3000"
    chrome_path = os.environ.get("CHROME_PATH") or None
    with sync_playwright() as p:
        try:
            if chrome_path:
                browser = p.chromium.launch(executable_path=chrome_path)
            else:
                browser = p.chromium.launch()
        except Exception as e:
            fail(f"could not launch a browser ({e}); set CHROME_PATH or run `playwright install chromium`")
        try:
            for w, h in VIEWPORTS:
                check_viewport(browser, base, w, h)
        finally:
            browser.close()
    print("PASS: e2e-scroll ok at 1440x900 and 1280x800")


if __name__ == "__main__":
    main()
