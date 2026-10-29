import { MAX_IMAGE_BODY_BYTES } from "@/core/images";

export type CappedBody =
  | { ok: true; text: string }
  | { ok: false; reason: "too_large" | "read_error" };

// Bounds how much of the request body we buffer before parsing: reject early
// on a lying-or-honest oversize content-length, then enforce a hard byte limit
// while streaming so a missing header can't bypass the cap.
export async function readBodyCapped(
  req: Pick<Request, "headers" | "body">,
  limit: number = MAX_IMAGE_BODY_BYTES,
): Promise<CappedBody> {
  const declared = req.headers.get("content-length");
  if (declared !== null) {
    const n = Number.parseInt(declared.trim(), 10);
    if (Number.isSafeInteger(n) && n > limit) return { ok: false, reason: "too_large" };
  }
  if (req.body === null) return { ok: true, text: "" };
  try {
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => {});
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
    const buf = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      buf.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, text: new TextDecoder().decode(buf) };
  } catch {
    return { ok: false, reason: "read_error" };
  }
}
