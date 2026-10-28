"""Opt-in end-to-end check that a reader visit downloads zero music bytes (not run in CI).

Usage: python3 scripts/e2e-music-bytes.py [base_url]  (default http://localhost:3000)
Browser: $CHROME_PATH when set, else Playwright's bundled Chromium.
Needs Python Playwright; when it is not importable this prints a skip and exits 0.
Exits 1 with a clear message on the first failed assertion.

Checks:
(1) paused: with music paused, /leer/c1s1 makes 0 music requests and every
    `.player audio` has preload "none" with an empty currentSrc;
(2) play: pressing play starts audible playback backed by fake in-memory
    music bytes (no real Blob transfer).
"""

import os
import sys

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("skip: python playwright is not installed (pip install playwright)")
    sys.exit(0)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from e2e_blob import MUSIC_URL, block_music, fake_music


def fail(msg):
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def check_paused(browser, base):
    ctx = browser.new_context()
    try:
        ctx.add_init_script("localStorage.setItem('lectoria.music.paused','1')")
        hits = block_music(ctx)
        seen = []
        ctx.on("request", lambda req: seen.append(req.url) if MUSIC_URL.search(req.url) else None)
        page = ctx.new_page()
        try:
            page.goto(f"{base}/leer/c1s1", wait_until="networkidle")
            page.wait_for_timeout(6000)
            if hits or seen:
                fail(f"paused reader fetched music bytes: {hits + seen}")
            audios = page.evaluate(
                """() => [...document.querySelectorAll('.player audio')].map((el) => ({
                    preload: el.preload,
                    currentSrc: el.currentSrc,
                }))"""
            )
            if not audios:
                fail("no .player audio elements found")
            for audio in audios:
                if audio["preload"] != "none":
                    fail(f"audio preload is {audio['preload']!r}, expected 'none'")
                if audio["currentSrc"]:
                    fail(f"paused audio has currentSrc {audio['currentSrc']!r}")
            print("paused: 0 music requests")
        finally:
            page.close()
    finally:
        ctx.close()


def check_play(browser, base):
    ctx = browser.new_context()
    try:
        ctx.add_init_script("localStorage.setItem('lectoria.music.paused','1')")
        hits = fake_music(ctx)
        page = ctx.new_page()
        try:
            page.goto(f"{base}/leer/c1s1", wait_until="networkidle")
            page.wait_for_selector(".player button.play", timeout=10000)
            page.click(".player button.play")
            playing = False
            for _ in range(32):
                playing = page.evaluate(
                    """() => [...document.querySelectorAll('.player audio')].some(
                        (el) => el.paused === false && el.currentTime > 0)"""
                )
                if playing:
                    break
                page.wait_for_timeout(250)
            if not playing:
                fail("pressing play did not start audible playback within 8 s")
            if not hits:
                fail("playback started without fetching any music bytes")
            print("play: music started")
        finally:
            page.close()
    finally:
        ctx.close()


def main():
    if len(sys.argv) > 1 and sys.argv[1] in ("-h", "--help"):
        print("usage: python3 scripts/e2e-music-bytes.py [base_url]")
        return
    base = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://localhost:3000"
    chrome_path = os.environ.get("CHROME_PATH") or None
    args = ["--autoplay-policy=no-user-gesture-required"]
    with sync_playwright() as p:
        try:
            if chrome_path:
                browser = p.chromium.launch(executable_path=chrome_path, args=args)
            else:
                browser = p.chromium.launch(args=args)
        except Exception as e:
            fail(f"could not launch a browser ({e}); set CHROME_PATH or run `playwright install chromium`")
        try:
            check_paused(browser, base)
            check_play(browser, base)
        finally:
            browser.close()
    print("ok")


if __name__ == "__main__":
    main()
