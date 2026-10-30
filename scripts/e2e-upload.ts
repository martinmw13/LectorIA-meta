// End-to-end upload run against the real Meta and Jev APIs. Not run in
// CI: the owner runs it by hand over a real EPUB. In-memory KV and Blob,
// Turnstile off, and the handler's own clients built from env keys.
//
// Run: npx tsx scripts/e2e-upload.ts <file.epub> <outDir>
//
// Env: META_API_KEY (required), JEV_API_KEY (optional; without it scenes
// classify with the contributor model alone). Keys are never printed.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { register } from "node:module";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { EpubError, readEpubSections, type XmlParser } from "../core/epub";
import { countWords, uploadAnalysisPath, uploadBookPath } from "../core/uploads";
import { createMemoryKV } from "../core/images";
import { usable } from "../server/guard/env";
import { memoryStore } from "../server/uploads/memory";
import type { UploadEnv } from "../server/uploads/env";

// server-only throws outside Next; stub it before the handler loads, then
// import the handler late so the stub is already registered.
register("./stub-server-only.mjs", import.meta.url);

const { handleUploadsCreate, handleUploadStep } = await import("../server/uploads/handler");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const [epubPath, outDir] = process.argv.slice(2);
if (!epubPath || !outDir) fail("usage: npx tsx scripts/e2e-upload.ts <file.epub> <outDir>");

const metaKey = usable(process.env.META_API_KEY);
if (!metaKey) fail("META_API_KEY is missing");
const jevKey = usable(process.env.JEV_API_KEY);
if (!jevKey) console.error("note: JEV_API_KEY is missing, scenes classify without Jev");

function readInput(path: string): Uint8Array {
  try {
    return new Uint8Array(readFileSync(path));
  } catch {
    fail(`cannot read ${path}`);
  }
}

// Same section reader the browser and pipeline use, with jsdom parsing.
const parse: XmlParser = (text, type) =>
  type === "text/html" ? new JSDOM(text).window.document : new JSDOM(text, { contentType: type }).window.document;

const { title, author, sections } = (() => {
  try {
    return readEpubSections(readInput(epubPath), parse);
  } catch (e) {
    fail(e instanceof EpubError ? `epub: ${e.code}` : "epub: unreadable");
  }
})();

const env: UploadEnv = {
  upstashUrl: "memory",
  upstashToken: "memory",
  uploadsToken: "memory",
  metaKey,
  ...(jevKey ? { jevKey } : {}),
  sessionSecret: randomUUID(),
  ipSalt: randomUUID(),
  spendCapMicro: 1_000_000_000,
};
const kv = createMemoryKV();
const store = memoryStore();

// One cookie jar across calls, like the browser's sequential drive.
const jar = new Map<string, string>();

function stashCookies(res: Response): void {
  for (const c of res.headers.getSetCookie()) {
    const pair = c.split(";")[0] ?? "";
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(jar.size === 0 ? {} : { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") }),
    },
    body: JSON.stringify(body),
  });
}

const created = await handleUploadsCreate(post("https://e2e.test/api/uploads", { title, author, sections }), {
  env,
  kv,
  store,
  now: new Date(),
});
stashCookies(created);
const createdBody = (await created.json()) as { status: string; code?: string; id?: string; chapters?: number; parts?: number };
if (created.status !== 200 || createdBody.status !== "created" || !createdBody.id || !createdBody.parts) {
  fail(`create: ${createdBody.code ?? created.status}`);
}
const id = createdBody.id;
console.log(`create: 1 call, ${createdBody.chapters} chapters, ${createdBody.parts} parts`);

const stepMs: number[] = [];
let costUsd = 0;
for (let i = 0; i < createdBody.parts + 1; i++) {
  const t0 = Date.now();
  const res = await handleUploadStep(post(`https://e2e.test/api/uploads/${id}/step`, {}), id, {
    env,
    kv,
    store,
    now: new Date(),
  });
  stashCookies(res);
  stepMs.push(Date.now() - t0);
  const body = (await res.json()) as { status: string; code?: string; costUsd?: number };
  if (body.status === "done") {
    costUsd = body.costUsd ?? 0;
    break;
  }
  if (body.status !== "working") fail(`step: ${body.code ?? res.status}`);
  if (i === createdBody.parts) fail("step: still working past the last part");
}

const bookRaw = await store.readText(uploadBookPath(id));
const analysisRaw = await store.readText(uploadAnalysisPath(id));
if (!bookRaw || !analysisRaw) fail("missing output blobs");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "book.json"), bookRaw);
writeFileSync(join(outDir, "analysis.json"), analysisRaw);

const book = JSON.parse(bookRaw) as { chapters: unknown[]; paragraphs: { text: string }[] };
const analysis = JSON.parse(analysisRaw) as { scenes: { final: { vector: Record<string, number> } | null }[] };
let words = 0;
for (const p of book.paragraphs) words += countWords(p.text);
const emotions = new Map<string, number>();
for (const s of analysis.scenes) {
  let top = "none";
  let best = 0;
  for (const [emotion, v] of Object.entries(s.final?.vector ?? {})) {
    if (v > best) {
      best = v;
      top = emotion;
    }
  }
  emotions.set(top, (emotions.get(top) ?? 0) + 1);
}
console.log(`words: ${words}`);
console.log(`chapters: ${book.chapters.length}`);
console.log(`scenes: ${analysis.scenes.length}`);
console.log(`emotions: ${[...emotions].map(([k, v]) => `${k}=${v}`).join(" ")}`);
stepMs.forEach((ms, i) => console.log(`step ${i + 1}: ${ms} ms`));
console.log(`costUsd: ${costUsd}`);
console.log(`wrote: ${join(outDir, "book.json")} ${join(outDir, "analysis.json")}`);
