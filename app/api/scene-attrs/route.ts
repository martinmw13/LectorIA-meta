import { handleSceneAttrsGet } from "@/server/scene-attrs";

export const runtime = "nodejs";

// Thin shell: validation and lookup live in server/scene-attrs.ts so
// tests call the handler directly. Read-only public data, like health.
export async function GET(req: Request): Promise<Response> {
  return handleSceneAttrsGet(req);
}
