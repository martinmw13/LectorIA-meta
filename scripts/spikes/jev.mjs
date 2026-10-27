import { writeFile } from "node:fs/promises";
import { passages } from "./passages.mjs";

const key = process.env.JEV_API_KEY;
if (!key) throw new Error("JEV_API_KEY is not set");
console.log("key present:", Boolean(process.env.JEV_API_KEY));

const IDS = ["calma", "alegria", "tristeza", "suspenso", "misterio", "aventura", "combate", "asombro"];
const questions = {
  emotion: {
    type: "choice",
    instructions: "Which single emotion best matches the mood of this passage?",
    criteria: {
      calma: "Calm, peaceful, safe; nothing threatening happens",
      alegria: "Joyful, warm, celebratory; good things happen",
      tristeza: "Sad, mournful, loss or grief",
      suspenso: "Tense, anxious, danger may strike at any moment",
      misterio: "Mysterious, strange, uncanny; things defy explanation",
      aventura: "Adventurous, journeying into the unknown with wonder",
      combate: "Violent conflict, fighting, ferocious attack",
      asombro: "Awe, amazement, wonder at something spectacular",
    },
  },
  intensity: {
    type: "score",
    instructions: "How intense are the stakes and energy of this passage?",
    criteria: [
      "very quiet, low stakes",
      "calm, mild tension",
      "moderate stakes and energy",
      "high stakes, dramatic",
      "overwhelming, peak stakes",
    ],
  },
  tempo: {
    type: "score",
    instructions: "How fast does this passage move?",
    criteria: ["still, slow, lingering", "unhurried, gentle movement", "steady, moderate pace", "fast, urgent action", "frantic, rapid action"],
  },
};

let sawUnknown = false;
let sawMissing = false;
for (const p of passages) {
  const t0 = Date.now();
  const res = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "jev-1.14.0", state: p.text, questions }),
  });
  const ms = Date.now() - t0;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    console.log(`${p.id}: FAIL status=${res.status} latency_ms=${ms} error=${body?.error?.message ?? JSON.stringify(body)?.slice(0, 200)}`);
    continue;
  }
  await writeFile(`scripts/spikes/out/jev-${p.id}.json`, JSON.stringify(body));
  const a = body.answers ?? {};
  const probs = a.emotion?.probabilities ?? {};
  const keys = Object.keys(probs);
  const missing = IDS.filter((id) => !(id in probs));
  const extra = keys.filter((k) => !IDS.includes(k));
  if (a.emotion?.choice === "unknown") sawUnknown = true;
  if (missing.length > 0) sawMissing = true;
  const sum = keys.reduce((t, k) => t + (probs[k] ?? 0), 0);
  const vec = IDS.map((id) => `${id}=${(probs[id] ?? NaN).toFixed(3)}`).join(" ");
  const norm = (s) => (typeof s?.score === "number" ? (s.score / 4).toFixed(3) : "?");
  console.log(
    `${p.id}: OK status=${res.status} latency_ms=${ms} model=${body.model} ` +
      `choice=${a.emotion?.choice} confidence=${a.emotion?.confidence} sum=${sum.toFixed(3)} ` +
      `missing=[${missing}] extra=[${extra}]`
  );
  console.log(`  probs: ${vec}`);
  console.log(
    `  intensity score=${a.intensity?.score} norm=${norm(a.intensity)} conf=${a.intensity?.confidence} ` +
      `tempo score=${a.tempo?.score} norm=${norm(a.tempo)} conf=${a.tempo?.confidence}`
  );
  console.log(`  usage=${JSON.stringify(body.usage ?? null)}`);
}
console.log(`saw_unknown=${sawUnknown} saw_missing_ids=${sawMissing}`);
console.log("pricing: jev-quickstart docs carry no jev-1.14.0 price, cost unknown");
