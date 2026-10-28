import { handleImagesPost } from "@/server/images/handler";

export const runtime = "nodejs";
export const maxDuration = 120;

// Thin shell: parsing, books, and the full order of operations live in
// server/images/handler.ts and orchestrate.ts so tests skip the network.
export async function POST(req: Request): Promise<Response> {
  return handleImagesPost(req);
}
