"""Opt-in end-to-end check for the reader chat (not run in CI).

Usage: python3 scripts/e2e-chat.py [base_url]  (default http://localhost:3000)
Browser: $CHROME_PATH when set, else Playwright's bundled Chromium.
Screenshots: saved to $SHOTS_DIR when set (one per skin, plus grid.png).
Needs Python Playwright; when it is not importable this prints a skip and exits 0.

Music is blocked and /api/chat is mocked, so no Blob bytes and no model
calls. In each of the six skins at 1440x900 it asserts:
(a) the "Ask the book" launcher sits clear of the music player;
(b) the bubble's tail is on its right half (it opens toward the page);
(c) a suggested question streams the mocked answer into the panel;
(d) the open panel stays above the music player;
(e) a quota reply shows the "Bring your own key!" step;
(f) no page errors.
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

SKINS = ["engraving", "watercolor", "ink", "pencil", "comic", "chihiro"]
ANSWER = "The Scarecrow wants brains, so he joins Dorothy on the road."
SSE = (
    'event: delta\ndata: {"text":"The Scarecrow wants brains, "}\n\n'
    'event: delta\ndata: {"text":"so he joins Dorothy on the road."}\n\n'
    'event: done\ndata: {"remaining":14}\n\n'
)
GENERAL = [
    "Can you summarize this chapter so far?",
    "What should I remember from earlier chapters?",
    "What did I need to notice before this chapter?",
]
QUOTA = '{"code":"quota","message":"That\'s your 15 questions for today."}'


def fail(msg):
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def overlaps(a, b):
    return not (a["x"] + a["width"] <= b["x"] or b["x"] + b["width"] <= a["x"]
                or a["y"] + a["height"] <= b["y"] or b["y"] + b["height"] <= a["y"])


def main():
    base = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000").rstrip("/")
    shots = os.environ.get("SHOTS_DIR")
    paths = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None)
        for skin in SKINS:
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            hits = block_music(ctx)
            mode = {"reply": "ok"}

            def chat_route(route):
                if mode["reply"] == "quota":
                    route.fulfill(status=429, content_type="application/json", body=QUOTA)
                else:
                    route.fulfill(status=200, content_type="text/event-stream", body=SSE)

            ctx.route("**/api/chat", chat_route)
            page = ctx.new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(f"{base}/leer/c5s1?skin={skin}", wait_until="networkidle")
            launch = page.locator(".chat-launch")
            launch.wait_for(state="visible")
            if "Ask the book" not in (launch.text_content() or ""):
                fail(f"{skin}: launcher label is {launch.text_content()!r}")
            player = page.locator(".player").first.bounding_box()
            if player and overlaps(launch.bounding_box(), player):
                fail(f"{skin}: launcher covers the music player")
            # Tail: the body path's lowest point must sit right of centre.
            tail_x = page.evaluate("""() => {
              const p = document.querySelector('.chat-bub .bub-body');
              const len = p.getTotalLength(); let best = {x: 0, y: -1};
              for (let i = 0; i <= 400; i++) { const q = p.getPointAtLength(len * i / 400); if (q.y > best.y) best = q; }
              return best.x;
            }""")
            if tail_x <= 23:
                fail(f"{skin}: bubble tail at x={tail_x}, expected the right half")
            launch.click()
            sugg = page.locator(".chat-sugg .chat-link").all_inner_texts()
            if [t.strip() for t in sugg] != GENERAL:
                fail(f"{skin}: suggestions {sugg}, expected the general three")
            page.locator(".chat-sugg .chat-link").first.click()
            page.locator(".chat-a", has_text=ANSWER).wait_for(timeout=10_000)
            panel = page.locator(".chat-panel").bounding_box()
            if player and panel["y"] + panel["height"] > player["y"]:
                fail(f"{skin}: panel runs into the music player")
            if shots:
                path = os.path.join(shots, f"chat-{skin}.png")
                page.screenshot(path=path)
                paths.append(path)
            mode["reply"] = "quota"
            page.locator(".chat-ta").fill("What happens next?")
            page.locator(".chat-send").click()
            page.get_by_text("Bring your own key!").wait_for(timeout=10_000)
            if shots:
                page.screenshot(path=os.path.join(shots, f"chat-{skin}-byok.png"))
            if errors:
                fail(f"{skin}: page errors {errors}")
            print(f"ok {skin}: music requests blocked={len(hits)}")
            ctx.close()
        browser.close()
    if shots and paths:
        try:
            from PIL import Image
        except ImportError:
            return
        tiles = [Image.open(x).resize((720, 450)) for x in paths]
        grid = Image.new("RGB", (720 * 3, 450 * 2), "white")
        for i, t in enumerate(tiles):
            grid.paste(t, ((i % 3) * 720, (i // 3) * 450))
        grid.save(os.path.join(shots, "grid.png"))
    print("PASS: reader chat in all six skins")


if __name__ == "__main__":
    main()
