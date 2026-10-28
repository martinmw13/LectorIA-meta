Small fix for task 9 on branch `music-library` (already rebased on main). Do not run `next start` or `next dev`. Commit when done with message "Fix task 9 rebase fixture and v2 style name".

1. `npm run typecheck` fails: `core/reader.test.ts:238` builds a `Track` fixture without the now-required `gainDb`. Add `gainDb: 0` to that fixture, matching how other core test fixtures were updated in commit fbed48b. Fix any other typecheck error of the same kind; change nothing else in that file.
2. `core/music-manifest.ts` (around line 61) names the implicit style of the legacy v2 manifest path `Orquesta`. All user-facing strings must be English: rename it to `Orchestra` and update any test that asserts the old name (only the v2 path; leave other test fixtures that use `Orquesta` as arbitrary sample data alone unless a test fails).

Then run `npm run typecheck`, `npm test`, `npm run test:hooks`, `npm run build`; all must pass.
