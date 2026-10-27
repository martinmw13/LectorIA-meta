// Pre-commit secret scan: staged text files must hold no credentials.
// With --all it scans every tracked file at HEAD plus full git history.
// Plain Node, no dependencies. Findings never print the secret itself.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ALLOW_MARKER = 'secret-scan:allow';
// Paths the secret scan skips: lockfiles only, which we do not author.
// Binary blobs are skipped separately via isBinaryBuffer. Everything else
// is scanned, including agent-logs/, public/ and .agents/skills/.
export const SECRET_IGNORE_PATTERNS = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'uv.lock',
  'poetry.lock',
  '*.lock',
];

export function isSecretSkipped(path) {
  const slash = path.lastIndexOf('/');
  const name = slash === -1 ? path : path.slice(slash + 1);
  for (const pattern of SECRET_IGNORE_PATTERNS) {
    if (pattern.includes('*')) {
      if (name.endsWith(pattern.slice(1))) return true;
    } else if (name === pattern) {
      return true;
    }
  }
  return false;
}
export const ENTROPY_THRESHOLD = 3.5;
export const ENTROPY_MIN_LENGTH = 20;

// Each rule needs a token-looking suffix so prose that names a prefix
// (like this file) does not match. Keep it that way when adding rules.
export const RULES = [
  { name: 'jev', pattern: /\bjv_live_[A-Za-z0-9_-]{16,}/ },
  { name: 'openai', pattern: /sk-[A-Za-z0-9_-]{20,}/ },
  { name: 'meta-llm', pattern: /LLM\|[A-Za-z0-9_-]{10,}/ },
  { name: 'meta-bearer', pattern: /Bearer\s+[A-Za-z0-9._~-]{20,}/ },
  { name: 'github', pattern: /(?:ghp|gho)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/ },
  { name: 'aws', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'private-key', pattern: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/ },
  { name: 'redis-url', pattern: /rediss?:\/\/[^:\s]+:[^@\s]+@/ },
];

const ASSIGNMENT = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/;
const SECRET_NAME = /(KEY|TOKEN|SECRET|PASSWORD)$/i;
const PLACEHOLDERS = ['your-', 'your_', 'changeme', 'change-me', 'xxx', '<', '>'];

// File names refused whatever they hold. .env.example stays allowed.
export function isForbiddenFilename(path) {
  const slash = path.lastIndexOf('/');
  const name = slash === -1 ? path : path.slice(slash + 1);
  return (
    name === '.env' ||
    name === '.env.local' ||
    (name.startsWith('.env.') && name.endsWith('.local')) ||
    name.endsWith('.pem')
  );
}

export function shannonEntropy(text) {
  const counts = new Map();
  for (const char of text) counts.set(char, (counts.get(char) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / text.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function unquote(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' || first === "'") && first === last) return value.slice(1, -1);
  }
  return value;
}

function isPlaceholderValue(value) {
  const lower = value.toLowerCase();
  return PLACEHOLDERS.some((marker) => lower.includes(marker));
}

export function redact(secret) {
  return secret.slice(0, 4) + '…';
}

// Pure and testable: findings look like { path, line, rule, preview }.
export function scanContent(path, content) {
  const findings = [];
  const exampleFile = path === '.env.example' || path.endsWith('/.env.example');
  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line.includes(ALLOW_MARKER)) continue;
    const assignment = ASSIGNMENT.exec(line);
    if (exampleFile && assignment) {
      const value = unquote(assignment[2]);
      if (value === '' || isPlaceholderValue(value)) continue;
    }
    for (const rule of RULES) {
      const match = rule.pattern.exec(line);
      if (match) {
        findings.push({ path, line: index + 1, rule: rule.name, preview: redact(match[0]) });
      }
    }
    if (assignment && SECRET_NAME.test(assignment[1])) {
      const value = unquote(assignment[2]);
      if (value.length >= ENTROPY_MIN_LENGTH && shannonEntropy(value) > ENTROPY_THRESHOLD) {
        findings.push({ path, line: index + 1, rule: 'high-entropy', preview: redact(value) });
      }
    }
  }
  return findings;
}

export function isBinaryBuffer(buffer) {
  const head = buffer.subarray(0, 8000);
  return head.includes(0);
}

function splitNul(output) {
  const text = output.toString('utf8');
  return text.length === 0 ? [] : text.split('\0').filter((entry) => entry !== '');
}

function stagedPaths() {
  const output = execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
    { encoding: 'buffer', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  return splitNul(output);
}

function headPaths() {
  const output = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', '-z'], {
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return splitNul(output);
}

function showBlob(revision, path) {
  return execFileSync('git', ['show', `${revision}:${path}`], {
    encoding: 'buffer',
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function scanBlob(revision, path, findings) {
  if (isForbiddenFilename(path)) {
    findings.push({ path, line: 0, rule: 'forbidden-filename', preview: '(blocked file name)' });
    return;
  }
  if (isSecretSkipped(path)) return;
  let blob;
  try {
    blob = showBlob(revision, path);
  } catch {
    console.error(`warning: cannot read staged content of ${path}, skipping it`);
    return;
  }
  if (isBinaryBuffer(blob)) return;
  findings.push(...scanContent(path, blob.toString('utf8')));
}

// One finding per forbidden path seen in history headers, even when its content matches nothing.
export function historyFileFinding(file, flagged) {
  if (isForbiddenFilename(file) && !flagged.has(file)) {
    flagged.add(file);
    return { path: `${file} (history)`, line: 0, rule: 'forbidden-filename', preview: '(blocked file name)' };
  }
  return null;
}

function scanHistory(findings) {
  let output;
  try {
    output = execFileSync('git', ['log', '-p', '--all'], {
      encoding: 'buffer',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return; // No history yet.
  }
  let file = '<history>';
  let removed = null;
  const flagged = new Set();
  for (const line of output.toString('utf8').split('\n')) {
    if (line.startsWith('--- a/')) {
      removed = line.slice('--- a/'.length);
    } else if (line.startsWith('+++ b/')) {
      file = line.slice('+++ b/'.length);
      const finding = historyFileFinding(file, flagged);
      if (finding) findings.push(finding);
    } else if (line === '+++ /dev/null') {
      file = removed ?? '<deleted>'; // Deleted file: label with its old path.
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      if (!isSecretSkipped(file)) findings.push(...scanContent(`${file} (history)`, line.slice(1)));
    }
  }
}

function report(findings) {
  if (findings.length === 0) return 0;
  console.error(`error: secret scan found ${findings.length} problem(s):`);
  for (const finding of findings) {
    const location = finding.line > 0 ? `${finding.path}:${finding.line}` : finding.path;
    console.error(`  ${location} [${finding.rule}] ${finding.preview}`);
  }
  console.error('Remove the secret (and any history that holds it), use an env var, then commit again.');
  return 1;
}

function main() {
  const findings = [];
  if (process.argv.includes('--all')) {
    let paths;
    try {
      paths = headPaths();
    } catch {
      console.error('note: no commits yet, nothing to scan with --all');
      return 0;
    }
    for (const path of paths) scanBlob('HEAD', path, findings);
    scanHistory(findings);
    return report(findings);
  }
  let paths;
  try {
    paths = stagedPaths();
  } catch {
    console.error('warning: not a git repo, skipping the secret scan');
    return 0;
  }
  for (const path of paths) scanBlob('', path, findings);
  return report(findings);
}

const invokedAsScript = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedAsScript) process.exit(main());
