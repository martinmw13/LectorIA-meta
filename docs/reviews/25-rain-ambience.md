# Review 25 (rain ambience)

Round 0 (manager). Scope is right. core/ambience.ts is pure (levels, cycle, labels, gain, prefs parsing). The controller sits behind an injected engine. app/player.tsx has two added lines: the import and `<RainAmbience muted={muted} />` after the volume label. The CSS follows the 4-state visual spec: off is a 40% outline, the halos are celeste, yellow and red, drops loop, the bolt flashes, transitions take 200 ms, and reduced motion is handled. Tests cover the cycle, persistence, fades and mute. Findings:
1. BLOCKING. The engine scheduled the sine fade-in curve and the later volume/mute ramps and `stop()` on one GainNode. `cancelScheduledValues(now)` does not remove a curve that is already running, so changing the level, muting or moving the slider inside the 1.5–2 s fade would throw `NotSupportedError` in Chrome and Safari.
2. NON-BLOCKING. The crossfade was not equal power: sine in and linear out leave about a -1.2 dB dip at the midpoint.
3. Note. The prefs key carries a `//gitleaks:allow` comment, because `lectoria.ambience.v1` trips generic-api-key. That is acceptable: it is a localStorage key, not a secret.

Fix 1 (Muse, 79841b4). Each voice now uses a chain of three gains: fadeIn (sine curve) → fadeOut (cosine curve, set once at stop) → level (linear ramps only). No param ever gets an event that overlaps its own curve. `stop()` is idempotent and stops immediately when the span is 0. The new engine tests use a fake AudioParam that throws on curve overlap, as Chrome does, and they check sin²+cos²≈1. 353 tests pass and tsc is clean. Verdict: approve. Both findings are resolved, so no further Muse round is needed.

Merge with main (manager). The merge brought in tasks 25 (ranking scope, which already uses docs/reviews/25.md, so this review is 25-rain-ambience.md), 26 and 27. Conflicts were import lines only: app/player.tsx now imports `MusicStyleControl` and `RainAmbience`, globals.css imports both stylesheets, and BUILT_DURING_HACKATHON.md keeps both rows. No code was rewritten. Architecture check after the merge: rain is fully independent of the music engine. It has its own Web Audio graph and level crossfade, its own volume and `lectoria.ambience.v1` prefs, and its own controller. Its only coupling to music is the `<RainAmbience muted>` mount, and `AMBIENCES` takes fireplace or wind as new entries with no engine change.

## 25b: still and frameless (manager review)

Martin's rule: no idle animation, and no box around the button. Muse commit 5c9ce06 does the following:
- Removes both infinite loops.
- Plays one drop cycle and one bolt flash on hover (on hover-capable devices only), and replays them after a click through `data-anim`, which a 1.4 s timer clears. The svg key restarts the animation on rapid clicks.
- Drops the border, background and box-shadow from `.skip.rain`. The level color becomes a `drop-shadow` glow on the icon, and the 34 px hit area stays.
- Adds a focus ring on `:focus-visible` only. Reduced motion turns off the hover and click animations as well.

Audio and prefs are untouched. Non-blocking: the delayed drops (0.45 s and 0.9 s) can be cut short when `data-anim` clears at 1.4 s, a snap back to rest that is hard to notice at 20 px. The tests check the CSS and TSX source text, because the repo has no DOM test setup. Verdict: approve.
