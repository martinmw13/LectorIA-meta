// Track selection and manifest parsing. Pure: no env, no fetch, no audio.
//
// Thin re-export index so existing imports keep working. The
// implementation lives in music-types, music-similarity,
// music-selection, music-manifest, and music-credit.
export * from "./music-types";
export * from "./music-similarity";
export * from "./music-selection";
export * from "./music-manifest";
export * from "./music-credit";
