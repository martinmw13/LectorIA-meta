// Validates every processed book under data/books against the pipeline
// invariants. CLI: `node scripts/validate-books.mjs [dataDir]` prints one
// line per problem and exits 1 if any are found.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EMOTIONS } from "../core/emotions.mjs";

let ROOT;
let problems;
const bad = (id, msg) => problems.push(`${id}: ${msg}`);
const load = (dir, name) => (existsSync(join(dir, name)) ? JSON.parse(readFileSync(join(dir, name), "utf8")) : null);
const unit = (x) => typeof x === "number" && x >= 0 && x <= 1;

function checkBook(id) {
  const dir = join(ROOT, id);
  const book = load(dir, "book.json");
  if (!book) return bad(id, "missing book.json");
  const tv = book.textVersion;
  if (book.id !== id) bad(id, `book.id ${book.id} != folder`);
  if (!/^sha256:[0-9a-f]{64}$/.test(tv)) bad(id, "bad textVersion");

  const pids = new Set();
  book.paragraphs.forEach((p, i) => {
    if (p.n !== i + 1) bad(id, `paragraph ${i} has n=${p.n}`);
    if (!p.id.startsWith(`c${p.ch}p`) || pids.has(p.id)) bad(id, `paragraph id ${p.id} duplicate or not in chapter ${p.ch}`);
    pids.add(p.id);
    if (!p.text?.trim()) bad(id, `paragraph ${p.id} empty`);
  });
  let next = 1;
  book.chapters.forEach((c, i) => {
    if (c.ch !== i + 1) bad(id, `chapter ${i} has ch=${c.ch}`);
    if (c.start_n !== next || c.end_n < c.start_n) bad(id, `chapter ${c.ch} range ${c.start_n}..${c.end_n}, expected start ${next}`);
    for (let n = c.start_n; n <= c.end_n; n++) {
      if (book.paragraphs[n - 1]?.ch !== c.ch) bad(id, `paragraph n=${n} not in chapter ${c.ch}`);
    }
    next = c.end_n + 1;
  });
  if (next !== book.paragraphs.length + 1) bad(id, `chapters end at ${next - 1}, paragraphs ${book.paragraphs.length}`);

  const scenes = load(dir, "scenes.json");
  if (!scenes) return bad(id, "missing scenes.json");
  if (scenes.textVersion !== tv) bad(id, "scenes.json textVersion stale");
  const byCh = new Map(book.chapters.map((c) => [c.ch, c]));
  let expect = 1;
  let prevCh = 0;
  const sids = new Set();
  for (const s of scenes.scenes) {
    if (s.ch !== prevCh && byCh.get(s.ch)?.start_n !== s.start_n) bad(id, `${s.id} is first of chapter ${s.ch} but starts at ${s.start_n}`);
    prevCh = s.ch;
    // Resplit keeps ids stable with a letter suffix (c1s1b), so check prefix and uniqueness only.
    if (!s.id.startsWith(`c${s.ch}s`) || sids.has(s.id)) bad(id, `scene id ${s.id} duplicate or not in chapter ${s.ch}`);
    sids.add(s.id);
    if (s.start_n !== expect) bad(id, `${s.id} starts at ${s.start_n}, expected ${expect}`);
    if (s.end_n < s.start_n) bad(id, `${s.id} empty range ${s.start_n}..${s.end_n}`);
    const c = byCh.get(s.ch);
    if (!c || s.start_n < c.start_n || s.end_n > c.end_n) bad(id, `${s.id} crosses chapter ${s.ch}`);
    if (!s.title?.trim() || !s.summary?.trim()) bad(id, `${s.id} missing title or summary`);
    expect = s.end_n + 1;
  }
  if (expect !== book.paragraphs.length + 1) bad(id, `scenes end at ${expect - 1}, paragraphs ${book.paragraphs.length}`);

  const analysis = load(dir, "analysis.json");
  if (analysis) {
    if (analysis.textVersion !== tv) bad(id, "analysis.json textVersion stale");
    if (analysis.scenes.length !== scenes.scenes.length) bad(id, `analysis has ${analysis.scenes.length} scenes, scenes.json ${scenes.scenes.length}`);
    analysis.scenes.forEach((a, i) => {
      const s = scenes.scenes[i];
      if (!s || a.id !== s.id || a.start_n !== s.start_n || a.end_n !== s.end_n) bad(id, `analysis scene ${i} (${a.id}) does not match scenes.json`);
      if (!a.final) return a.error ? undefined : bad(id, `${a.id} has no final and no error`);
      const keys = Object.keys(a.final.vector).sort().join();
      if (keys !== [...EMOTIONS].sort().join()) bad(id, `${a.id} vector keys ${keys}`);
      const sum = Object.values(a.final.vector).reduce((x, y) => x + y, 0);
      if (Math.abs(sum - 1) > 1e-6 || !Object.values(a.final.vector).every(unit)) bad(id, `${a.id} vector sum ${sum}`);
      if (!unit(a.final.intensity) || !unit(a.final.tempo)) bad(id, `${a.id} intensity/tempo out of 0..1`);
    });
    const clusters = load(dir, "music-clusters.json");
    if (clusters) {
      if (clusters.textVersion !== tv) bad(id, "music-clusters.json textVersion stale");
      const classified = analysis.scenes.filter((a) => a.final).map((a) => a.id).sort().join();
      if (clusters.clusters.flatMap((c) => c.scenes).sort().join() !== classified) bad(id, "clusters do not partition classified scenes");
      if (clusters.clusters.length !== clusters.k) bad(id, `k=${clusters.k} but ${clusters.clusters.length} clusters`);
      for (const c of clusters.clusters) {
        if (c.size !== c.scenes.length || c.size === 0) bad(id, `cluster ${c.id} size ${c.size} vs ${c.scenes.length} scenes`);
      }
    }
  }

  const narration = load(dir, "narration.json");
  if (narration) {
    if (narration.textVersion !== tv) bad(id, "narration.json textVersion stale");
    // Format 1 keys chapters directly; the per-voice format keys voices,
    // and every voice must cover every chapter.
    const keys = Object.keys(narration.chapters);
    const byVoice = keys.length > 0 && keys.every((k) => Number.isNaN(Number(k)))
      ? narration.chapters
      : { default: narration.chapters };
    const want = book.chapters.map((c) => c.ch).join();
    for (const [voice, chapters] of Object.entries(byVoice)) {
      const chs = Object.keys(chapters).map(Number).sort((a, b) => a - b).join();
      if (chs !== want) bad(id, `narration chapters ${voice === "default" ? "" : `(${voice}) `}${chs}`);
    }
  }
}

// Returns the checked book ids and one string per problem; empty means valid.
export function validateBooks(dataDir = join(dirname(fileURLToPath(import.meta.url)), "../data")) {
  ROOT = join(dataDir, "books");
  problems = [];
  const books = readdirSync(ROOT).filter((d) => statSync(join(ROOT, d)).isDirectory());
  const library = JSON.parse(readFileSync(join(dataDir, "library.json"), "utf8"));
  for (const entry of library) {
    if (entry.status === "ready" && !books.includes(entry.id)) bad(entry.id, "library says ready but no data/books folder");
  }
  books.forEach(checkBook);
  return { books, problems };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { books, problems } = validateBooks(process.argv[2]);
  for (const p of problems) console.error(p);
  console.log(`validate-books: ${books.length} book(s), ${problems.length} problem(s)`);
  process.exit(problems.length ? 1 : 0);
}
