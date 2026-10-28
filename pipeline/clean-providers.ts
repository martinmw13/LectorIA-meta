// Cleaning LLM wiring, shared by build.ts and clean-epub.ts. Reads env
// only: Modal Shared Endpoint first, Meta API fallback.
import { createCleanJudge } from "./clean-judge";
import { createMetaClient } from "./meta";
import type { Judge } from "../core/clean";

export const MODAL_CLEAN_MODEL_DEFAULT = "meta-models/Muse-Spark-Open-816B-A42B";
export const META_CLEAN_MODEL_DEFAULT = "muse-spark-1.3-contributor";

export interface CleanEnv {
  [key: string]: string | undefined;
  MODAL_CLEAN_URL?: string;
  MODAL_CLEAN_TOKEN?: string;
  MODAL_CLEAN_MODEL?: string;
  META_API_KEY?: string;
  CLEAN_MODEL?: string;
}

function isSet(value: string | undefined): boolean {
  return value !== undefined && value !== "";
}

// Both set: Modal primary, Meta fallback. Only one: that one alone.
export function createCleanJudgeFromEnv(env: CleanEnv = process.env, fetchFn?: typeof fetch): Judge {
  const modal = isSet(env.MODAL_CLEAN_URL) && isSet(env.MODAL_CLEAN_TOKEN);
  const meta = isSet(env.META_API_KEY);
  if (!modal && !meta) {
    throw new Error("no cleaning LLM configured (set MODAL_CLEAN_URL+MODAL_CLEAN_TOKEN or META_API_KEY)");
  }
  if (modal && meta) {
    return createCleanJudge(
      createMetaClient({
        fetchFn,
        apiKey: env.MODAL_CLEAN_TOKEN ?? "",
        model: env.MODAL_CLEAN_MODEL ?? MODAL_CLEAN_MODEL_DEFAULT,
        url: env.MODAL_CLEAN_URL,
        provider: "modal",
      }),
      createMetaClient({ fetchFn, apiKey: env.META_API_KEY ?? "", model: env.CLEAN_MODEL ?? META_CLEAN_MODEL_DEFAULT }),
    );
  }
  if (modal) {
    return createCleanJudge(
      createMetaClient({
        fetchFn,
        apiKey: env.MODAL_CLEAN_TOKEN ?? "",
        model: env.MODAL_CLEAN_MODEL ?? MODAL_CLEAN_MODEL_DEFAULT,
        url: env.MODAL_CLEAN_URL,
        provider: "modal",
      }),
    );
  }
  return createCleanJudge(
    createMetaClient({ fetchFn, apiKey: env.META_API_KEY ?? "", model: env.CLEAN_MODEL ?? META_CLEAN_MODEL_DEFAULT }),
  );
}
