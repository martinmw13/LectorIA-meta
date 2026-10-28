// Pre-commit size check: staged files must stay under 5000 tokens.
// Tokens = ceil(bytes / 4). Plain Node, no dependencies.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const MAX_TOKENS = 5000;
export const BYTES_PER_TOKEN = 4;

// Paths the size check skips. Entries ending in "/" match that directory
// anywhere in the path. Entries with "*" match the file name. Other entries
// match the full path or the file name. Add a pattern here (and say why in
// the commit message) when a file really is generated or third-party.
export const IGNORE_PATTERNS = [
  // Lockfiles: not authored by agents.
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'uv.lock',
  'poetry.lock',
  '*.lock',
  // Codegen: generated dirs cover their *.d.ts files too.
  '*.generated.*',
  '*.gen.*',
  'next-env.d.ts',
  'generated/',
  '__generated__/',
  // Build output.
  '.next/',
  'dist/',
  'out/',
  'coverage/',
  // Processed book data, and all of public/.
  'public/',
  'data/processed/',
  // Processed book data (book.json is generated, about 230 KB).
  'data/books/',
  'pipeline/out/',
  // Music library data: track metadata and an etiquetar export, not code.
  'data/music/',
  // Agent and session logs (the project log dir is agent-logs/).
  'agent-logs/',
  // Throwaway prototypes on the prototype/* branch, never merged.
  'prototypes/',
  // Vendored third-party skills.
  '.agents/skills/',
];

function globToRegExp(glob) {
  return new RegExp('^' + glob.split('*').map(escapeRegExp).join('.*') + '$');
}

function escapeRegExp(text) {
  return text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

function basename(path) {
  const index = path.lastIndexOf('/');
  return index === -1 ? path : path.slice(index + 1);
}

export function isIgnored(path) {
  const name = basename(path);
  for (const pattern of IGNORE_PATTERNS) {
    if (pattern.endsWith('/')) {
      if (path === pattern.slice(0, -1) || path.startsWith(pattern) || path.includes('/' + pattern)) {
        return true;
      }
    } else if (pattern.includes('*')) {
      if (globToRegExp(pattern).test(name)) return true;
    } else if (path === pattern || name === pattern || path.endsWith('/' + pattern)) {
      return true;
    }
  }
  return false;
}

export function estimateTokens(bytes) {
  return Math.ceil(bytes / BYTES_PER_TOKEN);
}

// Pure and testable: entries look like { path, bytes, isBinary }.
export function findOversized(entries) {
  const oversized = [];
  for (const entry of entries) {
    if (entry.isBinary || isIgnored(entry.path)) continue;
    const tokens = estimateTokens(entry.bytes);
    if (tokens > MAX_TOKENS) oversized.push({ path: entry.path, bytes: entry.bytes, tokens });
  }
  return oversized;
}

export const SPLIT_HELP = `How to split it:
- Split by responsibility into small modules, one concern per file, roughly under 300 lines.
- Put shared types in their own file.
- Move fixtures and test data to fixtures/ or public/.
- For TS/JS create a folder with an index.ts that re-exports the pieces so imports stay stable.
- For docs split by heading into docs/<topic>/*.md with a short index.
- For tests split per behavior.
- Never minify or remove comments to sneak under the limit.
- If the file really is generated or third-party, add its pattern to the ignore list in this script and explain why in the commit message.`;

function stagedPaths() {
  const output = execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
    { encoding: 'buffer', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const text = output.toString('utf8');
  return text.length === 0 ? [] : text.split('\0').filter((entry) => entry !== '');
}

// Pure and testable: flags from `git diff --numstat -z` output. Each record is
// one NUL-terminated "added\tdeleted\tpath" chunk; a rename is a chunk with
// an empty path followed by old-name and new-name chunks, keyed on the new.
export function parseNumstatZ(text) {
  const flags = new Map();
  if (text.length === 0) return flags;
  const parts = text.split('\0');
  for (let i = 0; i < parts.length; i++) {
    const chunk = parts[i];
    if (chunk === '') continue;
    const record = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/.exec(chunk);
    if (!record) continue;
    const isBinary = record[1] === '-' && record[2] === '-';
    let path = record[3];
    if (path === '') {
      const renamed = parts[i + 2];
      i += 2;
      if (renamed === undefined || renamed === '') continue;
      path = renamed;
    }
    flags.set(path, isBinary);
  }
  return flags;
}

// Binary flags from git's own numstat: git prints "-\t-\t" for files whose
// first 8000 bytes hold a NUL byte, so this reuses that detection.
function stagedBinaryFlags() {
  const output = execFileSync(
    'git',
    ['diff', '--cached', '--numstat', '--diff-filter=ACMR', '-z'],
    { encoding: 'buffer', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  return parseNumstatZ(output.toString('utf8'));
}

function stagedBlobSize(path) {
  const output = execFileSync('git', ['cat-file', '-s', ':' + path], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return Number.parseInt(output.trim(), 10);
}

function main() {
  let paths;
  let binaryFlags = new Map();
  try {
    paths = stagedPaths();
    binaryFlags = stagedBinaryFlags();
  } catch {
    console.error('warning: not a git repo, skipping the file-size check');
    return 0;
  }
  const entries = [];
  for (const path of paths) {
    if (isIgnored(path)) continue;
    let bytes;
    try {
      bytes = stagedBlobSize(path);
    } catch {
      continue; // Left the index since the diff was read.
    }
    entries.push({ path, bytes, isBinary: binaryFlags.get(path) === true });
  }
  const oversized = findOversized(entries);
  if (oversized.length === 0) return 0;
  console.error(`error: ${oversized.length} staged file(s) over the ${MAX_TOKENS}-token limit (tokens = ceil(bytes/4)):`);
  for (const file of oversized) {
    console.error(`  ${file.path}: ${file.bytes} bytes, about ${file.tokens} tokens`);
  }
  console.error('');
  console.error(SPLIT_HELP);
  return 1;
}

const invokedAsScript = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedAsScript) process.exit(main());
