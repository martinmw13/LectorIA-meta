import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const OUT = new URL("./out/", import.meta.url);
const COUNT_PATH = new URL("./out/image-count.txt", import.meta.url);
const CAP = 3;

const key = process.env.META_API_KEY;
if (!key) throw new Error("META_API_KEY is not set");
console.log("key present:", Boolean(process.env.META_API_KEY));

mkdirSync(OUT, { recursive: true });

const PROMPT =
  "A scene from L. Frank Baum's The Wonderful Wizard of Oz: Dorothy, a small girl, " +
  "clutching her little dog Toto inside a small wooden farmhouse as a cyclone lifts it " +
  "above the gray Kansas prairie. In the style of W. W. Denslow's 1900 illustrations " +
  "for the first edition: flat color, bold black outlines, limited palette, " +
  "Art Nouveau framing. Dorothy wears silver shoes. Explicitly nothing from the " +
  "1939 MGM film: no ruby slippers, no film look.";

function usedCount() {
  try {
    return parseInt(readFileSync(COUNT_PATH, "utf8").trim(), 10) || 0;
  } catch {
    return 0;
  }
}

// Hard cap: refuse before every call once 3 images exist.
function checkCap(label) {
  const n = usedCount();
  if (n >= CAP) {
    console.log(`${label}: REFUSED cap reached (used=${n}/${CAP}), no call made`);
    return false;
  }
  return true;
}

function webpDims(buf) {
  if (buf.length < 30) return null;
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
  const fourcc = buf.toString("ascii", 12, 16);
  if (fourcc === "VP8X") return { codec: "VP8X", w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
  if (fourcc === "VP8 ") return { codec: "VP8", w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (fourcc === "VP8L") {
    const bits = buf.readUInt32LE(21) & 0x0fffffff;
    return { codec: "VP8L", w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

async function generate(label, body, saveName) {
  if (!checkCap(label)) return { ok: false, refused: true };
  const t0 = Date.now();
  const res = await fetch("https://api.meta.ai/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg = json?.error?.message ?? "(empty body)";
    const code = json?.error?.code ?? "";
    console.log(`${label}: FAIL status=${res.status} code=${code} latency_ms=${ms} error=${msg}`);
    if (res.status === 400 && code === "content_policy_violation") console.log(`${label}: content policy block, not retrying`);
    return { ok: false };
  }
  const item = json.data?.[0] ?? {};
  const keys = `keys=[${Object.keys(json).join(",")}] item_keys=[${Object.keys(item).join(",")}]`;
  if (item.url) {
    const u = new URL(item.url);
    const params = [...u.searchParams.keys()];
    const expKey = params.find((k) => /expir|^exp$|deadline|valid/i.test(k));
    const signed = params.some((k) => /sig|sign|token|seal/i.test(k));
    console.log(
      `${label}: OK status=${res.status} latency_ms=${ms} ${keys} output_format=${json.output_format} ` +
        `url_host=${u.hostname} url_signed=${signed} url_expires_param=${expKey ?? "(none)"} ` +
        `url_expires_value=${expKey ? u.searchParams.get(expKey) : "(none)"} url_param_count=${params.length} ` +
        `usage=${JSON.stringify(json.usage ?? null)}`
    );
    const dl0 = Date.now();
    const dl = await fetch(item.url);
    const buf = Buffer.from(await dl.arrayBuffer());
    console.log(`${label}: download status=${dl.status} bytes=${buf.length} download_ms=${Date.now() - dl0}`);
    const dims = webpDims(buf);
    console.log(`${label}: dims=${dims ? `${dims.w}x${dims.h} (${dims.codec})` : "(unreadable)"}`);
    writeFileSync(new URL(`./out/${saveName}`, import.meta.url), buf);
    writeFileSync(COUNT_PATH, `${usedCount() + 1}\n`);
    return { ok: true };
  }
  const buf = Buffer.from(item.b64_json, "base64");
  const dims = webpDims(buf);
  console.log(
    `${label}: OK status=${res.status} latency_ms=${ms} ${keys} output_format=${json.output_format} ` +
      `bytes=${buf.length} dims=${dims ? `${dims.w}x${dims.h} (${dims.codec})` : "(unreadable)"} ` +
      `usage=${JSON.stringify(json.usage ?? null)}`
  );
  writeFileSync(new URL(`./out/${saveName}`, import.meta.url), buf);
  writeFileSync(COUNT_PATH, `${usedCount() + 1}\n`);
  return { ok: true };
}

const base = { model: "muse-image-1.0", prompt: PROMPT, n: 1, size: "1024x1024", output_format: "webp" };

console.log(`cap used=${usedCount()}/${CAP} at start`);
const a = await generate("a/url", { ...base, response_format: "url" }, "image-a-url.webp");
const b = await generate("b/b64_json", { ...base, response_format: "b64_json" }, "image-b-b64.webp");
let c = { ok: false };
if (a.ok && b.ok) {
  c = await generate(
    "c/b64-low",
    {
      ...base,
      response_format: "b64_json",
      reasoning_strength: "low",
      tool_enablement: { enable_web_search: false, enable_shell: false },
    },
    "image-c-low.webp"
  );
} else {
  console.log("c/b64-low: SKIPPED because (a) or (b) failed");
}
console.log(`done: a=${a.ok} b=${b.ok} c=${c.ok} cap used=${usedCount()}/${CAP}`);
