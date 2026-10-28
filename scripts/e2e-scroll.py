"""Opt-in end-to-end check for the continuous scroll reader (not run in CI).

Usage: python3 scripts/e2e-scroll.py [base_url]  (default http://localhost:3000)
Browser: $CHROME_PATH when set, else Playwright's bundled Chromium.
Screenshots: saved to $SHOTS_DIR when set.
Needs Python Playwright; when it is not importable this prints a skip and exits 0.
Exits 1 with a clear message on the first failed assertion.

At 1440x900 and 1280x800 it asserts:
(a) on /leer/c1s1 there is NO "Begin the chapter" button and chapter-1
    paragraph text is visible in the viewport right away;
(b) trackpad-like wheel input alone (no clicks) scrolls continuously and
    reaches chapter 2+ (URL becomes /leer/c2s... and a c2 paragraph is in
    view) and keeps going to chapter 3, with the URL scene id changing
    monotonically;
(c) frame timing is smooth while wheel-scrolling: requestAnimationFrame
    deltas measured in-page during the scroll have p95 <= 34 ms and no
    frame > 100 ms in headless Chromium;
(d) Space and PageDown scroll down (scrollTop increases), PageUp scrolls back;
(e) no page errors;
(f) chapter headings show no focus ring.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from e2e_blob import block_music

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("skip: python playwright is not installed (pip install playwright)")
    sys.exit(0)

VIEWPORTS = [(1440, 900), (1280, 800)]
WHEEL_ROUNDS = 60


def fail(msg):
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def scene_of(page):
    return page.url.rstrip("/").split("/")[-1].split("?")[0].split("#")[0]


def shot(page, tag, name):
    shots = os.environ.get("SHOTS_DIR")
    if not shots:
        return
    os.makedirs(shots, exist_ok=True)
    page.screenshot(path=os.path.join(shots, f"{tag}-{name}.png"))


def scroll_top(page):
    return page.evaluate("() => document.querySelector('.read-col').scrollTop")


def order_of(page):
    return page.evaluate("() => [...document.querySelectorAll('[data-scene-id]')].map(s => s.dataset.sceneId)")


def chapter_of(scene_id):
    try:
        return int(scene_id[1:].split("s")[0])
    except (ValueError, IndexError):
        return -1


def para_in_view(page, prefix):
    return page.evaluate(
        """(prefix) => {
            const col = document.querySelector('.read-col');
            if (!col) return false;
            const top = col.getBoundingClientRect().top;
            const bottom = top + col.clientHeight;
            for (const p of document.querySelectorAll(`p[id^="${prefix}"]`)) {
                const r = p.getBoundingClientRect();
                if (r.bottom > top + 1 && r.top < bottom - 1) return true;
            }
            return false;
        }""",
        prefix,
    )


def wheel_down(page, rounds, step=420):
    for _ in range(rounds):
        page.mouse.wheel(0, step)
        page.wait_for_timeout(16)


def summarize(deltas):
    xs = sorted(deltas)
    if not xs:
        return {"n": 0, "p50": 0, "p95": 0, "max": 0}
    pick = lambda q: xs[min(len(xs) - 1, int(q * len(xs)))]
    return {"n": len(xs), "p50": round(pick(0.50), 1), "p95": round(pick(0.95), 1), "max": round(max(xs), 1)}


def check_viewport(browser, base, w, h):
    tag = f"{w}x{h}"
    page = browser.new_page(viewport={"width": w, "height": h})
    block_music(page)
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    try:
        # (a) chapter 1 text is already on screen; no Begin gate.
        page.goto(f"{base}/leer/c1s1", wait_until="networkidle")
        page.wait_for_timeout(1200)
        if scene_of(page) != "c1s1":
            fail(f"[{tag}] expected to start at /leer/c1s1, got {page.url}")
        if page.get_by_text("Begin the chapter").count():
            fail(f"[{tag}] found a 'Begin the chapter' button")
        if not para_in_view(page, "c1p"):
            fail(f"[{tag}] no chapter-1 paragraph visible on load")
        print(f"[{tag}] load ok: chapter-1 text visible, no Begin gate")
        shot(page, tag, "load")

        # Order of scenes down the column, for the monotonicity check.
        order = order_of(page)
        if not order or order[0] != "c1s1":
            fail(f"[{tag}] no scene sections found (first={order[:1]})")

        # (b) wheel-only scroll to chapter 3, URL moving monotonically.
        seen = ["c1s1"]
        reached_c2 = False
        page.mouse.move(w * 0.55, h * 0.4)
        for _ in range(12):
            wheel_down(page, 8)
            page.wait_for_timeout(400)
            now = scene_of(page)
            if now != seen[-1]:
                if now not in order:
                    fail(f"[{tag}] URL scene {now} is not a known section")
                if order.index(now) < order.index(seen[-1]):
                    fail(f"[{tag}] URL scene went backwards: {seen[-1]} -> {now}")
                seen.append(now)
            if not reached_c2 and chapter_of(now) >= 2:
                if not para_in_view(page, "c2p"):
                    fail(f"[{tag}] URL says {now} but no c2 paragraph is in view")
                reached_c2 = True
                print(f"[{tag}] reached chapter 2 at {now}")
                shot(page, tag, "chapter2")
            if chapter_of(now) >= 3:
                break
        if chapter_of(scene_of(page)) < 3:
            fail(f"[{tag}] wheel scrolling did not reach chapter 3 (at {scene_of(page)})")
        print(f"[{tag}] scroll ok: {' -> '.join(seen)}")
        shot(page, tag, "chapter3")

        # (c) frame timing during a fresh wheel scroll: start the rAF
        # sampler in-page, wheel alongside it, then read the deltas.
        page.goto(f"{base}/leer/c1s1", wait_until="networkidle")
        page.wait_for_timeout(1000)
        page.mouse.move(w * 0.55, h * 0.4)
        page.evaluate(
            """() => {
                window.__deltas = [];
                window.__last = 0;
                window.__t0 = performance.now();
                window.__tick = (t) => {
                    if (window.__last) window.__deltas.push(t - window.__last);
                    window.__last = t;
                    if (t - window.__t0 < 2500) requestAnimationFrame(window.__tick);
                };
                requestAnimationFrame(window.__tick);
            }"""
        )
        wheel_down(page, WHEEL_ROUNDS, step=300)
        page.wait_for_timeout(2900)
        deltas = page.evaluate("() => window.__deltas || []")
        stats = summarize(deltas)
        print(f"[{tag}] frames: n={stats['n']} p50={stats['p50']}ms p95={stats['p95']}ms max={stats['max']}ms")
        if stats["n"] < 30:
            fail(f"[{tag}] too few frames sampled ({stats['n']})")
        if stats["p95"] > 34:
            fail(f"[{tag}] p95 frame delta {stats['p95']}ms > 34ms")
        if stats["max"] > 100:
            fail(f"[{tag}] max frame delta {stats['max']}ms > 100ms")

        # (d) native keys move the column.
        page.goto(f"{base}/leer/c1s1", wait_until="networkidle")
        page.wait_for_timeout(1000)
        before = scroll_top(page)
        page.keyboard.press("Space")
        page.wait_for_timeout(600)
        after_space = scroll_top(page)
        if after_space <= before:
            fail(f"[{tag}] Space did not scroll down ({before} -> {after_space})")
        page.keyboard.press("PageDown")
        page.wait_for_timeout(600)
        after_pgdn = scroll_top(page)
        if after_pgdn <= after_space:
            fail(f"[{tag}] PageDown did not scroll down ({after_space} -> {after_pgdn})")
        page.keyboard.press("PageUp")
        page.wait_for_timeout(600)
        back = scroll_top(page)
        if back >= after_pgdn:
            fail(f"[{tag}] PageUp did not scroll back ({after_pgdn} -> {back})")
        print(f"[{tag}] keys ok: Space/PageDown down, PageUp back")

        # (f) headings show no focus ring.
        rings = page.evaluate(
            """() => [...document.querySelectorAll('h1.chapter-title')].map((el) => {
                const s = getComputedStyle(el);
                return { style: s.outlineStyle, width: s.outlineWidth };
            })"""
        )
        if not rings:
            fail(f"[{tag}] no chapter headings found")
        for ring in rings:
            if ring["style"] != "none" and ring["width"] != "0px":
                fail(f"[{tag}] chapter heading outline not removed: {ring}")
        print(f"[{tag}] headings ok: {len(rings)} titles, no focus ring")

        # (e) no page errors across all three loads.
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
