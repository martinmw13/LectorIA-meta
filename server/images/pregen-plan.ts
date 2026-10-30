// Pure planning for scripts/pregen-chapters.ts: --book resolution.
// No fs, no env, no server-only, so the script and vitest share it.
export function resolveBooks(bookArg: string | undefined, readyIds: string[]): string[] {
  const valid = [...readyIds, "all-shelf"].join(", ");
  if (bookArg === undefined) {
    if (!readyIds.includes("oz")) throw new Error(`unknown book: oz (one of: ${valid})`);
    return ["oz"];
  }
  if (bookArg === "all-shelf") return readyIds.filter((id) => id !== "oz");
  if (readyIds.includes(bookArg)) return [bookArg];
  throw new Error(`unknown book: ${bookArg} (one of: ${valid})`);
}
