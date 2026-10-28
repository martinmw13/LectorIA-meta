// Scene isolation check: no scene route may ship another scene's text.
// Scans the prerendered HTML and RSC files of every scene route for
// excerpts of neighboring scenes' paragraphs. Run after `npm run build`.
// Fails when a neighbor excerpt appears, or when the scene's own text is
// missing from its HTML (which would prove the scan itself is blind).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXCERPT_LEN = 80;
const MIN_EXCERPT_LEN = 40;

export function unescapePayload(text) {
  return text
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\[nrt]/g, "")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// Lowercase alphanumeric only, so JSON/HTML escaping and whitespace
// differences cannot hide a leak.
export function normalize(text) {
  return unescapePayload(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function excerpt(text) {
  return normalize(text).slice(0, EXCERPT_LEN);
}

function loadScenes() {
  const book = JSON.parse(readFileSync(join(root, "data/books/oz/book.json"), "utf8"));
  const analysis = JSON.parse(readFileSync(join(root, "data/books/oz/analysis.json"), "utf8"));
  const byN = new Map(book.paragraphs.map((p) => [p.n, p.text]));
  return analysis.scenes.map((scene) => ({
    id: scene.id,
    texts: Array.from({ length: scene.end_n - scene.start_n + 1 }, (_, i) => byN.get(scene.start_n + i) ?? ""),
  }));
}

function routeFiles(sceneId) {
  const dir = join(root, ".next/server/app/leer");
  const names = existsSync(dir) ? readdirSync(dir) : [];
  const own = [`${sceneId}.html`, `${sceneId}.rsc`];
  const segments = names.filter((n) => n === `${sceneId}.segments`);
  const files = [];
  for (const name of own) {
    const path = join(dir, name);
    if (existsSync(path)) files.push(path);
  }
  for (const seg of segments) {
    for (const name of readdirSync(join(dir, seg))) {
      const path = join(dir, seg, name);
      if (statSync(path).isFile()) files.push(path);
    }
  }
  return files;
}

export function checkIsolation({ scenes, readFile = (p) => readFileSync(p, "utf8"), filesFor = routeFiles } = {}) {
  const list = scenes ?? loadScenes();
  const failures = [];
  for (let i = 0; i < list.length; i++) {
    const scene = list[i];
    if (!scene) continue;
    const files = filesFor(scene.id);
    if (files.length === 0) {
      failures.push(`${scene.id}: no prerendered files (run npm run build first)`);
      continue;
    }
    // The scene's own first paragraph must be in the HTML itself, not
    // just the RSC payload: otherwise the scan is blind to an empty page.
    const html = files.filter((f) => f.endsWith(".html")).map((f) => normalize(readFile(f))).join("\n");
    const haystack = files.map((f) => normalize(readFile(f))).join("\n");
    const own = excerpt(scene.texts[0] ?? "");
    if (own.length >= MIN_EXCERPT_LEN && !html.includes(own)) {
      failures.push(`${scene.id}: own text missing from HTML, the scan is blind`);
    }
    for (const neighbor of [list[i - 1], list[i + 1]]) {
      if (!neighbor) continue;
      for (const text of neighbor.texts) {
        const probe = excerpt(text);
        if (probe.length < MIN_EXCERPT_LEN) continue;
        if (haystack.includes(probe)) {
          failures.push(`${scene.id}: leaks text of neighbor ${neighbor.id}`);
          break;
        }
      }
    }
  }
  return failures;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = checkIsolation();
  if (failures.length > 0) {
    for (const failure of failures) console.error(`isolation: ${failure}`);
    process.exit(1);
  }
  console.log("isolation: every scene route carries only its own text");
}
