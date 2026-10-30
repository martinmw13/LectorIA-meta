import "server-only";
import type { ImageGenerator } from "@/core/images";

const ENDPOINT = "https://api.meta.ai/v1/images/generations";

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
      if (!res.ok) throw new Error(`meta status ${res.status}`);
      const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
      const b64 = json.data?.[0]?.b64_json;
      if (!b64) throw new Error("meta empty image");
      return new Uint8Array(Buffer.from(b64, "base64"));
    },
  };
}
