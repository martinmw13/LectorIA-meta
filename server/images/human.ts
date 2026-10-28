import "server-only";

// Turnstile runs here once per session. A later task wires the check;
// until then every request passes so images work without a widget.
export function verifyHuman(_req?: unknown): boolean {
  return true;
}
