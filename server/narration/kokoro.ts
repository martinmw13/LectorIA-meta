import "server-only";

// Re-exported for the future upload route. Relative import: tsconfig
// maps @/core/* and @/server/* only, so @/pipeline does not resolve.
export { createKokoroClient } from "../../pipeline/kokoro";
export type { KokoroClient, KokoroSynthResult } from "../../pipeline/kokoro";
