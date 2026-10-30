import { handleCleanup } from "@/server/uploads/cleanup";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel cron hits this daily; CRON_SECRET bearer auth hides the route.
export async function GET(req: Request): Promise<Response> {
  return handleCleanup(req);
}
