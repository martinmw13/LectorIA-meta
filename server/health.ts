import 'server-only';

// Liveness probe. Commit is the short Vercel SHA, or null outside Vercel.
export function health(): { status: 'ok'; commit: string | null } {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  return { status: 'ok', commit: sha ? sha.slice(0, 7) : null };
}
