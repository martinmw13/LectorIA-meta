"""Music plays from public/ and never from Vercel Blob.

Per skin: open the reader, let music autostart, and check the playing
element loads /music/v1/*.webm. On the first skin also seek (inside the
segment, since passing its end crossfades on purpose) and skip to
the next track. Any *.blob.vercel-storage.com/music/ request is aborted
and fails the run, since Blob transfer is metered.

Usage: python3 scripts/e2e-music-public.py [base_url] [shots_dir]
"""
import os
import re
import sys

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("skip: playwright not installed")
    sys.exit(0)

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
SKINS = ["engraving", "watercolor", "ink", "pencil", "comic", "chihiro"]
BLOB_MUSIC = re.compile(r"^https://[^/]+\.blob\.vercel-storage\.com/music/")
STATE = """[...document.querySelectorAll('.player audio')].map(a => ({
  src: new URL(a.currentSrc || 'about:blank').pathname, paused: a.paused,
  t: a.currentTime, ready: a.readyState, err: a.error && a.error.code }))"""


def fail(msg):
    print("FAIL:", msg)
    sys.exit(1)


def playing(pg, timeout_ms=15000):
    for _ in range(timeout_ms // 250):
        live = [a for a in pg.evaluate(STATE) if not a["paused"] and a["t"] > 0.2]
        if live:
            return live[0]
        pg.wait_for_timeout(250)
    fail(f"no music playing: {pg.evaluate(STATE)}")


def main():
    with sync_playwright() as p:
        chrome = os.environ.get("CHROME_PATH")
        browser = p.chromium.launch(
            **({"executable_path": chrome} if chrome else {}),
            args=["--autoplay-policy=no-user-gesture-required"],
        )
        blob_hits, statuses, csp = [], [], []
        for i, skin in enumerate(SKINS):
            ctx = browser.new_context()
            ctx.route(BLOB_MUSIC, lambda route: (blob_hits.append(route.request.url), route.abort()))
            pg = ctx.new_page()
            pg.on("response", lambda r: statuses.append(r.status) if "/music/v1/" in r.url else None)
            pg.on("console", lambda m: csp.append(m.text) if "Content Security Policy" in m.text else None)
            pg.goto(f"{BASE}/leer/c1s1?skin={skin}")
            now = playing(pg)
            if not re.fullmatch(r"/music/v1/[^/]+/[^/]+\.webm", now["src"]):
                fail(f"{skin}: unexpected src {now['src']}")
            skin_attr = pg.evaluate("document.documentElement.dataset.skin")
            if skin_attr != skin:
                fail(f"skin {skin} did not load (got {skin_attr})")
            print(f"{skin}: playing {now['src']} t={now['t']:.1f}")
            if SHOTS:
                pg.screenshot(path=f"{SHOTS}/{skin}.png")
            if i == 0:
                pg.evaluate("""() => { const a = [...document.querySelectorAll('.player audio')]
                  .find(x => !x.paused); a.currentTime = 45; }""")
                pg.wait_for_timeout(2500)
                after = playing(pg)
                if after["src"] != now["src"] or after["t"] < 45:
                    fail(f"seek did not land: {after}")
                print(f"seek: {after['src']} t={after['t']:.1f}")
                pg.click(".player button[aria-label='Next track']")
                nxt = None
                for _ in range(60):
                    pg.wait_for_timeout(250)
                    live = [a for a in pg.evaluate(STATE) if not a["paused"] and a["t"] > 0.2]
                    nxt = next((a for a in live if a["src"] != now["src"]), None)
                    if nxt and len(live) == 1:
                        break
                if not nxt:
                    fail(f"next track did not take over: {pg.evaluate(STATE)}")
                print(f"next: crossfaded to {nxt['src']}")
            ctx.close()
        browser.close()
    if blob_hits:
        fail(f"{len(blob_hits)} Blob music requests: {blob_hits[:3]}")
    if csp:
        fail(f"CSP violations: {csp[:3]}")
    if 206 not in statuses:
        fail(f"no 206 range responses for /music/v1/: {sorted(set(statuses))}")
    print(f"music responses: {sorted(set(statuses))}; Blob music requests: 0")
    print("ok")


main()
