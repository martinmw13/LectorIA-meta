import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isForbiddenFilename,
  redact,
  scanContent,
  shannonEntropy,
} from './check-secrets.mjs';

// Every fake below is built at runtime by concatenation, so this file holds
// no literal secret and passes the scan it tests.
const HIGH_ENTROPY_VALUE = 'aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0uV';

function rulesFor(path, content) {
  return scanContent(path, content).map((finding) => finding.rule);
}

function onlyRule(path, content) {
  const findings = scanContent(path, content);
  assert.equal(findings.length, 1);
  return findings[0];
}

test('flags Jev keys', () => {
  const token = 'jv_' + 'live_' + 't0k'.repeat(8);
  const finding = onlyRule('src/app.ts', `const key = "${token}";`);
  assert.equal(finding.rule, 'jev');
  assert.equal(finding.line, 1);
  assert.equal(finding.preview, 'jv_l…');
  assert.ok(!JSON.stringify(finding).includes(token));
});

test('flags OpenAI-style keys', () => {
  const token = 'sk-' + 'test' + 'A'.repeat(20);
  const finding = onlyRule('src/app.ts', `key=${token}`);
  assert.equal(finding.rule, 'openai');
  assert.ok(!JSON.stringify(finding).includes(token));
});

test('flags Meta LLM tokens', () => {
  const token = 'LLM' + '|sess' + 'B'.repeat(12);
  const finding = onlyRule('src/app.ts', `token=${token}`);
  assert.equal(finding.rule, 'meta-llm');
});

test('flags long Bearer literals', () => {
  const header = 'Bearer' + ' ' + 'C'.repeat(32);
  const finding = onlyRule('src/app.ts', `Authorization: ${header}`);
  assert.equal(finding.rule, 'meta-bearer');
});

test('flags GitHub tokens', () => {
  for (const prefix of ['ghp_', 'gho_']) {
    const token = prefix + 'D'.repeat(24);
    assert.deepEqual(rulesFor('src/app.ts', `token=${token}`), ['github']);
  }
  const token = 'github_pat_' + 'E'.repeat(24);
  assert.deepEqual(rulesFor('src/app.ts', `token=${token}`), ['github']);
});

test('flags AWS access keys', () => {
  const token = 'AKI' + 'A' + '0123456789ABCDEF';
  const finding = onlyRule('src/app.ts', `aws_id=${token}`);
  assert.equal(finding.rule, 'aws');
});

test('flags private key blocks', () => {
  const line = '-----BEGIN ' + 'RSA PRIVATE KEY-----';
  const finding = onlyRule('certs/key.txt', line);
  assert.equal(finding.rule, 'private-key');
});

test('flags Redis URLs with passwords', () => {
  const url = 'redi' + 's://' + 'reader' + ':s3cr3t-pass@' + 'cache:6379';
  const finding = onlyRule('src/app.ts', `url=${url}`);
  assert.equal(finding.rule, 'redis-url');
});

test('flags high-entropy KEY/TOKEN/SECRET/PASSWORD values', () => {
  for (const name of ['BACKUP_SECRET', 'API_TOKEN', 'SIGNING_KEY', 'DB_PASSWORD']) {
    const line = name + '=' + HIGH_ENTROPY_VALUE;
    const finding = onlyRule('src/app.ts', line);
    assert.equal(finding.rule, 'high-entropy');
  }
});

test('passes low-entropy and short values', () => {
  assert.deepEqual(rulesFor('src/app.ts', 'BACKUP_SECRET=' + 'a'.repeat(32)), []);
  assert.deepEqual(rulesFor('src/app.ts', 'BACKUP_SECRET=short'), []);
  assert.deepEqual(rulesFor('src/app.ts', 'BACKUP_SECRET='), []);
});

test('passes .env.example placeholders and empty values', () => {
  const body = [
    'META_API_KEY=',
    'JEV_API_KEY=your-key-here-1234567890',
    'SESSION_SECRET=changeme-please-1234567890',
    'IP_HASH_SALT=<paste-your-salt-here-1234>',
    'TURNSTILE_SECRET_KEY=xxx-replace-me-1234567890',
  ].join('\n');
  assert.deepEqual(rulesFor('.env.example', body), []);
  assert.deepEqual(rulesFor('config/.env.example', body), []);
});

test('still flags real-looking secrets in .env.example', () => {
  const line = 'META_API_KEY=' + HIGH_ENTROPY_VALUE;
  assert.deepEqual(rulesFor('.env.example', line), ['high-entropy']);
});

test('honors the inline allow marker', () => {
  const token = 'jv_' + 'live_' + 't0k'.repeat(8);
  const line = `const key = "${token}"; # secret-scan:allow`;
  assert.deepEqual(rulesFor('src/fixture.ts', line), []);
  const entropyLine = 'BACKUP_SECRET=' + HIGH_ENTROPY_VALUE + ' # secret-scan:allow';
  assert.deepEqual(rulesFor('src/fixture.ts', entropyLine), []);
});

test('reports the right line number', () => {
  const token = 'sk-' + 'test' + 'A'.repeat(20);
  const findings = scanContent('src/app.ts', ['const a = 1;', `key=${token}`, 'const b = 2;'].join('\n'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 2);
});

test('passes clean content', () => {
  assert.deepEqual(rulesFor('src/app.ts', 'const answer = 42;\n'), []);
});

test('refuses .env and .pem file names', () => {
  for (const path of ['.env', 'sub/.env', '.env.local', '.env.prod.local', 'certs/key.pem', 'a/b/c.pem']) {
    assert.equal(isForbiddenFilename(path), true, `${path} should be refused`);
  }
  for (const path of ['.env.example', '.env.sample', 'src/app.ts', 'docs/pem-notes.md']) {
    assert.equal(isForbiddenFilename(path), false, `${path} should be allowed`);
  }
});

test('redact keeps four chars', () => {
  assert.equal(redact('abcdefgh'), 'abcd…');
});

test('entropy math is sane', () => {
  assert.equal(shannonEntropy('aaaa'), 0);
  assert.equal(shannonEntropy('ab'), 1);
  assert.ok(shannonEntropy(HIGH_ENTROPY_VALUE) > 3.5);
});
