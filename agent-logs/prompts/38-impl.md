Task 38: no visible focus box on the scene/chapter heading after navigation.

Bug: after an in-app scene move (wheel, trackpad, keys, buttons), app/leer/scene-page.tsx focuses the heading (`#scene-heading`, an h1 with tabIndex={-1}) for screen-reader orientation. Chrome draws its default blue focus ring around it (e.g. arriving at Chapter 2's cover). Wheel scrolling is not a pointer interaction, so Chrome's :focus-visible heuristic also matches here, so a :focus-visible-only ring would still show. The heading is not interactive and never reachable by Tab (tabIndex -1), so it should never show a ring; keep the programmatic focus as is.

Fix:
1. In app/styles/folio.css, next to the existing `.read-col:focus` rule, add a rule removing the outline on the programmatically focused heading: `#scene-heading:focus, #scene-heading:focus-visible { outline: none; }` with a one-line comment (non-interactive, tabindex -1, focused only for screen-reader orientation). Do not touch focus styles of any button, link or input; they keep their :focus-visible rings.
2. Add an opt-in end-to-end check `scripts/e2e-scroll.py` (Python Playwright, not run in CI, no new npm dependency). I give you the working script below; adapt it into a tidy CLI: usage `python3 scripts/e2e-scroll.py [base_url]` (default http://localhost:3000), browser from env CHROME_PATH or Playwright's bundled chromium; if playwright is not importable, print a skip message and exit 0. It must assert (exit 1 with a clear message on failure) at 1440x900 and 1280x800: (a) trackpad-style swipes go from /leer/c1s1 cover through every chapter-1 page, one page per swipe (no label is skipped or repeated: the sequence of distinct labels changes on every swipe), and reach c2s1 within 20 swipes; (b) Space, PageDown, ArrowDown advance and PageUp goes back; (c) no page errors; (d) after arriving at c2s1 by wheel, `#scene-heading` has computed outline-style "none" (or outline-width 0px). Header docstring explains what it checks and that it is opt-in. Add one line about it in README.md under any existing development or testing section (or a new short "Checks" section).
3. Append a "38: heading focus" row to BUILT_DURING_HACKATHON.md in the existing format, and docs/tasks/38-heading-focus.md (6 lines max).

Rules: files under 5000 tokens. Run `npm run typecheck` and `npx vitest run app/folio`. Do not commit.

Working script to adapt:
```python
import sys,re
from playwright.sync_api import sync_playwright
base=sys.argv[1]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for w,h in [(1440,900),(1280,800)]:
        pg=b.new_page(viewport={"width":w,"height":h}); errs=[]
        pg.on("pageerror",lambda e:errs.append(str(e)))
        pg.goto(base+"/read/oz",wait_until="networkidle"); pg.wait_for_timeout(1000)
        def label(): 
            return pg.url.split("/")[-1], pg.locator(".scene-line").first.inner_text() if pg.locator(".scene-line").count() else pg.locator(".kicker").first.inner_text()
        seen=[label()]
        pg.mouse.move(w*0.55,h*0.4)
        for swipe in range(14):
            # trackpad-like swipe: 40 events of decaying delta, 16ms apart (inertia)
            for i in range(40): pg.mouse.wheel(0,max(2,int(60*(0.92**i)))); pg.wait_for_timeout(16)
            pg.wait_for_timeout(500)
            seen.append(label())
            if pg.url.endswith("c2s1"): break
        print(w,"swipes:",seen)
        pg.screenshot(path=f"/workspace/scrollbug/after-{w}.png")
        # keyboard on fresh load
        pg.goto(base+"/read/oz",wait_until="networkidle"); pg.wait_for_timeout(800)
        ks=[]
        for k in ["Space","PageDown","ArrowDown","ArrowRight","ArrowLeft","PageUp"]:
            pg.keyboard.press(k); pg.wait_for_timeout(700); ks.append((k,)+label())
        print(w,"keys:",ks,"errs",errs)
        pg.close()
    b.close()
```
