"""Opt-in end-to-end check for read aloud (not run in CI).

Usage: python3 scripts/e2e-narration.py [base_url]  (default http://localhost:3000)
Browser: $CHROME_PATH when set, else Playwright's bundled Chromium.
Screenshots: saved to $SHOTS_DIR when set.
Skips (exit 0) without Python Playwright. Exits 1 on the first failure.

It asserts: the Read aloud button is boxless; play starts at the live
scene; the word mark moves and the sentence highlight is set; music
sits ~18-21 dB under the voice and restores on pause; each skin gets
its mark treatment; the voice keeps going while the reader scrolls
away; reduced motion drops transitions; no page errors.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from e2e_blob import fake_music

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("skip: python playwright is not installed (pip install playwright)")
    sys.exit(0)

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000").rstrip("/")
TREATMENT = {
    "engraving": "engraving", "pencil": "engraving",
    "watercolor": "watercolor", "chihiro": "watercolor",
    "ink": "ink-doodle", "comic": "ink-doodle",
}


def fail(msg):
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def shot(page, name):
    shots = os.environ.get("SHOTS_DIR")
    if shots:
        os.makedirs(shots, exist_ok=True)
        page.screenshot(path=os.path.join(shots, f"{name}.png"))


def state(page):
    return page.evaluate(
        """() => {
            const v = document.querySelector('audio[aria-label="Read aloud"]');
            const m = [...document.querySelectorAll('.player audio')].map(a => a.paused ? 0 : a.volume);
            const mark = document.querySelector('.narr-mark');
            const r = mark ? mark.getBoundingClientRect() : null;
            return {
                t: v ? v.currentTime : -1, paused: v ? v.paused : true,
                voice: v ? v.volume : 0, music: Math.max(0, ...m), src: v ? v.currentSrc : '',
                mark: r ? [Math.round(r.left), Math.round(r.top)] : null,
                treatment: mark ? mark.dataset.treatment : null,
                sentence: CSS.highlights ? (CSS.highlights.get('narration-sentence')?.size ?? 0) : -1,
            };
        }"""
    )


def wait_playing(page, ms=15000):
    page.wait_for_function(
        "() => { const v = document.querySelector('audio[aria-label=\"Read aloud\"]'); return v && !v.paused && v.currentTime > 0.5; }",
        timeout=ms,
    )


def main():
    errors = []
    with sync_playwright() as p:
        kw = {"args": ["--autoplay-policy=no-user-gesture-required"]}
        if os.environ.get("CHROME_PATH"):
            kw["executable_path"] = os.environ["CHROME_PATH"]
        browser = p.chromium.launch(**kw)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        fake_music(page)
        # Music autostarts since #83; start paused so the Play click below starts it.
        page.add_init_script("localStorage.setItem('lectoria.music.paused','1')")
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{BASE}/leer/c3s1?skin=engraving")
        btn = page.locator(".read-aloud-btn")
        btn.wait_for()
        box = btn.evaluate("b => { const s = getComputedStyle(b); return [s.borderTopWidth, s.backgroundColor, s.cursor]; }")
        if box[0] not in ("0px",) or box[1] not in ("rgba(0, 0, 0, 0)", "transparent"):
            fail(f"read aloud button has a box: {box}")
        if box[2] != "pointer":
            fail(f"read aloud button cursor is {box[2]}")
        shot(page, "01-button")

        # Music first so the duck has something to act on.
        page.locator(".player .play").click()
        page.wait_for_timeout(1500)
        before = state(page)["music"]
        if before <= 0:
            fail("music did not start")

        btn.click()
        wait_playing(page)
        page.wait_for_timeout(1200)  # duck ramp is 400 ms
        s1 = state(page)
        in_view = page.evaluate("""() => {
            const m = document.querySelector('.narr-mark');
            const c = document.querySelector('.read-col').getBoundingClientRect();
            if (!m) return false;
            const r = m.getBoundingClientRect();
            return r.top >= c.top && r.bottom <= c.bottom && r.width > 0;
        }""")
        if not in_view:
            fail("word mark is not on screen inside the reading column")
        if s1["mark"] is None or s1["sentence"] < 1:
            fail(f"no word mark or sentence highlight: {s1}")
        mark_scene = page.evaluate("() => { const h = CSS.highlights.get('narration-sentence'); const r = h && [...h][0]; const n = r && r.startContainer; const el = n && (n.nodeType === 1 ? n : n.parentElement); return el?.closest('[data-scene-id]')?.dataset.sceneId; }")
        if mark_scene != "c3s1":
            fail(f"voice did not start at the live scene c3s1 (mark in {mark_scene})")
        db = 20 * math.log10(s1["music"] / s1["voice"]) if s1["music"] > 0 else -99
        print(f"duck: voice {s1['voice']:.3f} music {s1['music']:.4f} ({db:.1f} dB), music before {before:.3f}")
        if not (-21.5 <= db <= -17.5) and s1["music"] > 0:
            fail(f"music is {db:.1f} dB under the voice, want 18-21")
        shot(page, "02-reading-engraving")
        page.wait_for_timeout(2500)
        s2 = state(page)
        if s2["mark"] == s1["mark"] or s2["t"] <= s1["t"]:
            fail(f"word mark did not move: {s1['mark']} -> {s2['mark']}")
        shot(page, "03-reading-later")

        # Scrolling away must not steer the voice.
        t_before = state(page)["t"]
        page.evaluate("() => document.querySelector('.read-col').scrollBy(0, 6000)")
        page.wait_for_timeout(1500)
        s3 = state(page)
        if s3["paused"] or s3["t"] < t_before or s3["t"] - t_before > 3:
            fail(f"voice jumped or stopped after scrolling away: {t_before} -> {s3['t']}")

        for skin, want in TREATMENT.items():
            page.evaluate("(s) => { document.documentElement.dataset.skin = s; }", skin)
            got = None
            for _ in range(20):  # the mark is absent in pauses between words
                page.wait_for_timeout(150)
                got = state(page)["treatment"]
                if got:
                    break
            if got != want:
                fail(f"skin {skin}: mark {got}, want {want}")
            if want == "ink-doodle":
                stroke = page.evaluate("() => getComputedStyle(document.querySelector('.narr-mark svg')).stroke")
                if stroke in ("rgb(255, 255, 255)", "none"):
                    fail(f"skin {skin}: ink circle stroke is {stroke}")
            shot(page, f"04-skin-{skin}")

        btn.click()
        page.wait_for_timeout(1500)
        s4 = state(page)
        if not s4["paused"]:
            fail("pause did not pause")
        if abs(s4["music"] - before) > 0.02:
            fail(f"music did not restore on pause: {before} -> {s4['music']}")
        print(f"restore: music {s4['music']:.3f}")
        shot(page, "05-paused")

        rm = browser.new_page(viewport={"width": 1280, "height": 800}, reduced_motion="reduce")
        fake_music(rm)
        rm.on("pageerror", lambda e: errors.append(str(e)))
        rm.goto(f"{BASE}/leer/c3s1?skin=watercolor")
        rm.locator(".read-aloud-btn").click()
        wait_playing(rm)
        rm.wait_for_timeout(800)
        tr = rm.evaluate("() => { const m = document.querySelector('.narr-mark'); return m ? getComputedStyle(m).transitionDuration : null; }")
        if tr is None or any(float(x.rstrip("s")) > 0.001 for x in tr.split(",")):
            fail(f"reduced motion still transitions the mark: {tr}")
        shot(rm, "06-reduced-motion")
        browser.close()
    if errors:
        fail(f"page errors: {errors}")
    print("ok: read aloud e2e passed")


main()
