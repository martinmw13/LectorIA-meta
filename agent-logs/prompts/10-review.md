Review task 10 on branch ui-english against origin/main (read-only review; do
not edit code, do not start a server). Spec: docs/tasks/10-english-player.md,
agent-logs/prompts/10-impl.md, 10-fix1.md, 10-fix2.md, 10-fix3.md, and the
"Grok Bot review" section already in docs/reviews/10.md.
Check: correctness (selection with no mode, no immediate repeat, ⏭ cycling and
fallback, ⏮ history and restart, crossfade updates of the now-playing line,
prefs migration for volume/mute/style with old values, Picture scene and the
Picture this popover rules, ordinals only, page line budget), security (no
secrets, no raw errors to clients, no new endpoints), contracts doc vs code,
tests that assert behaviour, English-only UI, accessibility labels, and that
public/music, audio, the converter and the CSP are untouched.
Append a section "## Muse review, round 1" to docs/reviews/10.md with numbered
findings marked Must / Should / Nit, and a final verdict line
"Verdict: clean" or "Verdict: changes needed". Commit only that file.
