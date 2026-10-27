import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens, findOversized, isIgnored, MAX_TOKENS, parseNumstatZ } from './check-file-size.mjs';

const OVER = (MAX_TOKENS + 1) * 4; // 20004 bytes, just over the limit
const HUGE = 10 * 1024 * 1024;

test('tokens are ceil(bytes/4)', () => {
  assert.equal(estimateTokens(20000), 5000);
  assert.equal(estimateTokens(20001), 5001);
  assert.equal(estimateTokens(0), 0);
});

test('an oversized file fails', () => {
  const found = findOversized([{ path: 'src/big.js', bytes: OVER, isBinary: false }]);
  assert.equal(found.length, 1);
  assert.equal(found[0].path, 'src/big.js');
  assert.equal(found[0].tokens, 5001);
});

test('a file with exactly 5000 tokens passes', () => {
  const found = findOversized([{ path: 'src/edge.js', bytes: 20000, isBinary: false }]);
  assert.deepEqual(found, []);
});

test('a file with 5001 tokens fails', () => {
  const found = findOversized([{ path: 'src/over.js', bytes: 20001, isBinary: false }]);
  assert.equal(found.length, 1);
});

test('a small file passes', () => {
  const found = findOversized([{ path: 'src/small.js', bytes: 120, isBinary: false }]);
  assert.deepEqual(found, []);
});

test('ignored paths pass even when huge', () => {
  const paths = [
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'bun.lockb',
    'uv.lock',
    'poetry.lock',
    'sub/dir/odd.lock',
    'src/types.generated.ts',
    'src/query.gen.js',
    'next-env.d.ts',
    'generated/schema.d.ts',
    'src/__generated__/relay.ts',
    '.next/static/chunks/app.js',
    'dist/bundle.js',
    'out/index.html',
    'coverage/lcov.info',
    'public/books/oz.json',
    'public/favicon.ico',
    'data/processed/scenes.json',
    'pipeline/out/music.json',
    'agent-logs/01-plan.jsonl',
    '.agents/skills/unslop/SKILL.md',
  ];
  for (const path of paths) assert.equal(isIgnored(path), true, `${path} should be ignored`);
  const entries = paths.map((path) => ({ path, bytes: HUGE, isBinary: false }));
  assert.deepEqual(findOversized(entries), []);
});

test('non-ignored paths are not ignored', () => {
  for (const path of ['src/app.ts', 'scripts/check-size.mjs', 'README.md', 'data/raw/oz.epub', 'docs/muse-code-sessions/01.md']) {
    assert.equal(isIgnored(path), false, `${path} should be checked`);
  }
});

test('binary files pass even when huge', () => {
  const found = findOversized([{ path: 'assets/cover.png', bytes: HUGE, isBinary: true }]);
  assert.deepEqual(found, []);
});

test('numstat -z parser flags binary, renames, and spaced paths', () => {
  const raw =
    '-\t-\tassets/cover.png\0' + '3\t1\tmy file.txt\0' + '5\t2\t\0old.txt\0new.txt\0' + '1\t0\tsrc/ok.js\0';
  const flags = parseNumstatZ(raw);
  assert.equal(flags.get('assets/cover.png'), true);
  assert.equal(flags.get('my file.txt'), false);
  assert.equal(flags.get('new.txt'), false);
  assert.equal(flags.has('old.txt'), false);
  assert.equal(flags.get('src/ok.js'), false);
});

test('numstat -z parser handles empty output', () => {
  assert.equal(parseNumstatZ('').size, 0);
});

test('only the offending files are reported', () => {
  const found = findOversized([
    { path: 'src/ok.js', bytes: 100, isBinary: false },
    { path: 'src/bad.js', bytes: OVER, isBinary: false },
    { path: 'dist/skipped.js', bytes: HUGE, isBinary: false },
  ]);
  assert.deepEqual(
    found.map((entry) => entry.path),
    ['src/bad.js'],
  );
});
