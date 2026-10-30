import "server-only";
import type { ImageGenerator } from "@/core/images";

const ENDPOINT = "https://api.meta.ai/v1/images/generations";

// A failed generation carrying only safe fields: the HTTP status and the
// provider's error code/type plus a short scrubbed message. Never the
// request, headers, or the raw body.
export class MetaImageError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`meta status ${status}${detail ? ` ${detail}` : ""}`);
    this.name = "MetaImageError";
  }
}

const SECRETISH = /(bearer\s+\S+|sk-[\w-]+|[A-Za-z0-9_-]{32,})/gi;

export function scrubDetail(text: string): string {
  return text.replace(SECRETISH, "[redacted]").replace(/\s+/g, " ").trim().slice(0, 160);
}

async function safeErrorDetail(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { error?: { code?: unknown; type?: unknown; message?: unknown } };
    const err = json.error ?? {};
    const parts: string[] = [];
    if (typeof err.code === "string") parts.push(`code=${scrubDetail(err.code)}`);
    if (typeof err.type === "string") parts.push(`type=${scrubDetail(err.type)}`);
    if (typeof err.message === "string") parts.push(`"${scrubDetail(err.message)}"`);
    return parts.join(" ");
  } catch {
    return "";
  }
}

// Providers word content filtering differently (content_policy_violation,
// safety_block, content_filter, "blocked"), so match a small marker set
// case-insensitively against the scrubbed code/type/message.
const POLICY_MARKERS = /content_policy|policy|safety|content_filter|blocked/i;

export function isPolicyRejection(e: unknown): boolean {
  return e instanceof MetaImageError && POLICY_MARKERS.test(e.detail);
}

// One-line reason for logs in operator scripts. Unknown errors map to
// their name only, so nothing unexpected is echoed.
export function safeFailureReason(e: unknown): string {
  if (e instanceof MetaImageError) return e.message;
  if (e instanceof Error && e.message === "meta empty image") return "meta empty image (likely filtered)";
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return "timeout";
  return e instanceof Error ? e.name : "unknown error";
}

// Meta image client. Reads no env: the caller passes the key in, and
// tests inject a fake generator instead of this module. The 100 s budget
// leaves room inside the 120 s route for Blob, quota, and the refund.
export function createMetaClient(apiKey: string): ImageGenerator {
  return {
    async generate(prompt: string): Promise<Uint8Array> {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "muse-image-1.0",
          prompt,
          n: 1,
          size: "1024x1024",
          output_format: "webp",
          response_format: "b64_json",
        }),
        signal: AbortSignal.timeout(100_000),
      });
      if (!res.ok) throw new MetaImageError(res.status, await safeErrorDetail(res));
      const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
      const b64 = json.data?.[0]?.b64_json;
      if (!b64) throw new Error("meta empty image");
      return new Uint8Array(Buffer.from(b64, "base64"));
    },
  };
}
