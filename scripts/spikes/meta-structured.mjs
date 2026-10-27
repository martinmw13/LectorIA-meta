import { passages } from "./passages.mjs";

const key = process.env.META_API_KEY;
if (!key) throw new Error("META_API_KEY is not set");
console.log("key present:", Boolean(process.env.META_API_KEY));

// Split each passage on sentences into 3 paragraphs, ordinals n from 1.
const paras = [];
for (const p of passages) {
  const sentences = p.text.replace(/\s+/g, " ").match(/[^.!?"]+[.!?]["”]?/g).map((s) => s.trim());
  const per = Math.ceil(sentences.length / 3);
  for (let i = 0; i < sentences.length; i += per) {
    paras.push({ n: paras.length + 1, from: p.id, text: sentences.slice(i, i + per).join(" ") });
  }
}
const inputText = paras.map((p) => `[${p.n}] ${p.text}`).join("\n");
const N = paras.length;
console.log(`paragraphs=${N}: ${paras.map((p) => `${p.n}(${p.from})`).join(" ")}`);

const schema = {
  type: "object",
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          first_n: { type: "integer" },
          last_n: { type: "integer" },
          title: { type: "string" },
          evidence: { type: "string" },
          characters: { type: "array", items: { type: "string" } },
        },
        required: ["first_n", "last_n", "title", "evidence", "characters"],
        additionalProperties: false,
      },
    },
  },
  required: ["scenes"],
  additionalProperties: false,
};

// Tiny manual validator, no deps.
function validate(v) {
  const errs = [];
  if (typeof v !== "object" || v === null || Array.isArray(v)) return ["root not an object"];
  if (Object.keys(v).join() !== "scenes") errs.push("root keys != [scenes]");
  if (!Array.isArray(v.scenes)) return [...errs, "scenes not an array"];
  v.scenes.forEach((s, i) => {
    const keys = Object.keys(s).sort().join();
    if (keys !== "characters,evidence,first_n,last_n,title") errs.push(`scene ${i} keys=[${keys}]`);
    if (!Number.isInteger(s.first_n) || !Number.isInteger(s.last_n)) errs.push(`scene ${i} n not integer`);
    if (typeof s.title !== "string" || !s.title) errs.push(`scene ${i} bad title`);
    if (typeof s.evidence !== "string" || !s.evidence) errs.push(`scene ${i} bad evidence`);
    if (!Array.isArray(s.characters) || !s.characters.every((c) => typeof c === "string")) {
      errs.push(`scene ${i} bad characters`);
    }
  });
  return errs;
}

function checkCoverage(scenes) {
  const seen = new Map();
  for (const s of scenes) {
    if (!Number.isInteger(s.first_n) || !Number.isInteger(s.last_n) || s.first_n > s.last_n) {
      return { ok: false, detail: "inverted or non-integer range" };
    }
    for (let n = s.first_n; n <= s.last_n; n++) seen.set(n, (seen.get(n) ?? 0) + 1);
  }
  const missing = [];
  const overlap = [];
  for (let n = 1; n <= N; n++) {
    if (!seen.has(n)) missing.push(n);
    else if (seen.get(n) > 1) overlap.push(n);
  }
  const extra = [...seen.keys()].filter((n) => n < 1 || n > N);
  const ok = missing.length === 0 && overlap.length === 0 && extra.length === 0;
  return { ok, detail: `missing=[${missing}] overlap=[${overlap}] extra=[${extra}]` };
}

async function run(label) {
  const t0 = Date.now();
  const res = await fetch("https://api.meta.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "muse-spark-1.3-contributor",
      messages: [
        {
          role: "user",
          content:
            `Split these ${N} numbered paragraphs into scenes. Return first_n/last_n ` +
            `ordinals, a short title, one verbatim evidence quote under 20 words, and ` +
            `characters per scene.\n${inputText}`,
        },
      ],
      response_format: { type: "json_schema", json_schema: { name: "scene_split", strict: true, schema } },
    }),
  });
  const ms = Date.now() - t0;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    console.log(`${label}: FAIL status=${res.status} latency_ms=${ms} error=${body?.error?.message ?? "(empty)"}`);
    return { usd: 0 };
  }
  const content = body.choices?.[0]?.message?.content ?? "";
  let parsed = null;
  let parseOk = false;
  try {
    parsed = JSON.parse(content);
    parseOk = true;
  } catch {
    parseOk = false;
  }
  const verrs = parseOk ? validate(parsed) : ["unparseable"];
  const coverage = parseOk ? checkCoverage(parsed.scenes) : { ok: false, detail: "unparseable" };
  let evOk = true;
  let evDetail = "";
  if (parseOk) {
    const flat = passages.map((p) => p.text.replace(/\s+/g, " ")).join(" ");
    for (const [i, s] of parsed.scenes.entries()) {
      const words = s.evidence.split(/\s+/).filter(Boolean).length;
      if (!flat.includes(s.evidence.replace(/\s+/g, " ")) || words >= 20) {
        evOk = false;
        evDetail += ` scene${i}(words=${words})`;
      }
    }
  }
  const u = body.usage ?? {};
  const cached = u.cached_input_tokens ?? u.prompt_cache_hit_tokens ?? u.cached_tokens ?? 0;
  const promptBill = Math.max(0, (u.prompt_tokens ?? 0) - cached);
  const outTok = u.completion_tokens ?? u.output_tokens ?? 0;
  const usd = (promptBill * 0.1 + cached * 0.002 + outTok * 0.2) / 1e6;
  console.log(
    `${label}: OK status=${res.status} latency_ms=${ms} parse=${parseOk} schema_valid=${verrs.length === 0}` +
      (verrs.length ? ` schema_errs=${verrs.join(";")}` : "") +
      ` coverage=${coverage.ok} ${coverage.detail} evidence_verbatim=${evOk}${evDetail} ` +
      `chars=${content.length} scenes=${parseOk ? parsed.scenes.length : "?"} ` +
      `usage=${JSON.stringify(u)} cost_usd=${usd.toFixed(6)}`
  );
  return { usd };
}

// Deliberately unsupported: recursive schema, documented as rejected with 400.
async function runRecursive() {
  const bad = {
    type: "object",
    properties: { child: { $ref: "#" } },
    required: ["child"],
    additionalProperties: false,
  };
  const t0 = Date.now();
  const res = await fetch("https://api.meta.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "muse-spark-1.3-contributor",
      messages: [{ role: "user", content: "hi" }],
      response_format: { type: "json_schema", json_schema: { name: "recursive", strict: true, schema: bad } },
    }),
  });
  const ms = Date.now() - t0;
  const body = await res.json().catch(() => null);
  console.log(
    `recursive: status=${res.status} latency_ms=${ms} error=${body?.error?.message ?? JSON.stringify(body)?.slice(0, 200)}`
  );
}

let total = 0;
for (const label of ["run1", "run2", "run3"]) total += (await run(label)).usd;
await runRecursive();
console.log(`total_structured_cost_usd=${total.toFixed(6)}`);
