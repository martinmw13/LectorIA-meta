import { health } from '@/server/health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json(health(), { headers: { 'Cache-Control': 'no-store' } });
}
