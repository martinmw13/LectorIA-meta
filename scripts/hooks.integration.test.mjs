import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const TRAILER_PATTERN = /Co-authored-by: Muse Code \(Meta\)/g;

let repo;

function git(args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

before(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'lectoria-hooks-'));
  git(['init', '-b', 'main', '-q']);
  git(['config', 'user.name', 'Hook Test']);
  git(['config', 'user.email', 'hook-test@example.invalid']);
  git(['config', 'commit.gpgsign', 'false']);
  fs.cpSync(path.join(repoRoot, '.githooks'), path.join(repo, '.githooks'), { recursive: true });
  fs.cpSync(path.join(repoRoot, 'scripts'), path.join(repo, 'scripts'), { recursive: true });
  fs.chmodSync(path.join(repo, '.githooks', 'pre-commit'), 0o755);
  fs.chmodSync(path.join(repo, '.githooks', 'prepare-commit-msg'), 0o755);
  git(['config', 'core.hooksPath', '.githooks']);
});

function trailerCount() {
  const body = git(['log', '-1', '--format=%B']);
  return (body.match(TRAILER_PATTERN) ?? []).length;
}

test('a 21 KB staged file fails with split instructions', () => {
  fs.writeFileSync(path.join(repo, 'big.txt'), 'a'.repeat(21 * 1024));
  git(['add', 'big.txt']);
  assert.throws(() => git(['commit', '-m', 'add big file']), /How to split it/);
  git(['rm', '--cached', '-q', 'big.txt']);
  fs.unlinkSync(path.join(repo, 'big.txt'));
});

test('a small file commits', () => {
  fs.writeFileSync(path.join(repo, 'small.txt'), 'hello\n');
  git(['add', 'small.txt']);
  git(['commit', '-q', '-m', 'add small file']);
});

test('a 21 KB package-lock.json commits', () => {
  fs.writeFileSync(path.join(repo, 'package-lock.json'), 'x'.repeat(21 * 1024));
  git(['add', 'package-lock.json']);
  git(['commit', '-q', '-m', 'add lockfile']);
});

test('a staged 21 KB random binary file commits', () => {
  const blob = randomBytes(21 * 1024);
  blob[100] = 0; // Guarantee a NUL in git's 8000-byte probe window.
  fs.writeFileSync(path.join(repo, 'blob.bin'), blob);
  git(['add', 'blob.bin']);
  git(['commit', '-q', '-m', 'add binary fixture']);
});

test('a staged fake Jev key fails the secret scan', () => {
  const fake = 'jv_' + 'live_' + 'z9'.repeat(12);
  fs.writeFileSync(path.join(repo, 'token.txt'), `api_key = "${fake}"\n`);
  git(['add', 'token.txt']);
  assert.throws(() => git(['commit', '-m', 'add token']), /\[jev\]/);
  git(['rm', '--cached', '-q', 'token.txt']);
  fs.unlinkSync(path.join(repo, 'token.txt'));
});

test('the co-author trailer appears exactly once, even after amend', () => {
  assert.equal(trailerCount(), 1);
  git(['commit', '--amend', '--no-edit', '-q']);
  assert.equal(trailerCount(), 1);
});
