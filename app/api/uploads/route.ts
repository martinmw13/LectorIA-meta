import { handleUploadsCreate } from "@/server/uploads/handler";

export const runtime = "nodejs";
export const maxDuration = 60;

// Thin shell: the full order of operations lives in
// server/uploads/handler.ts so tests skip the network.
export async function POST(req: Request): Promise<Response> {
  return handleUploadsCreate(req);
}
