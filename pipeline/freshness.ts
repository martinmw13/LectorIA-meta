// One freshness rule per pipeline step: each step compares the
// fingerprint of its real input against the key its last run recorded.
// Reuse only when the keys match and --force is off.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyInputOf, fingerprint } from "../core/fingerprint";
import { NARRATION_FORMAT, NARRATION_MODEL, NARRATION_SPEED, NARRATION_VOICE } from "../core/narration";
import { parseBookNarration } from "../core/narration-book";

export { classifyInputOf, fingerprint };

export interface StepKeys {
  recorded: string | undefined;
  current: string;
}

export interface FreshnessDecision {
  reuse: boolean;
  reason: string;
}

export function decide(force: boolean, recorded: string | undefined, current: string): FreshnessDecision {
  if (force) return { reuse: false, reason: "forced" };
  if (recorded === undefined) return { reuse: false, reason: "no previous output" };
  if (recorded === current) return { reuse: true, reason: "inputs unchanged" };
  return { reuse: false, reason: "inputs changed" };
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function resplitInputOf(scenes: { id: unknown; start_n: unknown; end_n: unknown }[], textVersion: unknown): string {
  return fingerprint({ textVersion, scenes: scenes.map((s) => ({ id: s.id, start_n: s.start_n, end_n: s.end_n })) });
}

export function clusterInputOf(scenes: { id: unknown; final: unknown }[]): string {
  return fingerprint(scenes.map((s) => ({ id: s.id, final: s.final })));
}

export function narrateInputOf(textVersion: unknown, voice: unknown, model: unknown, speed: unknown, format: unknown): string {
  return fingerprint({ textVersion, voice, model, speed, format });
}

export function segmentKeys(dir: string): StepKeys {
  const book = asRecord(readJson(join(dir, "book.json")));
  const scenes = asRecord(readJson(join(dir, "scenes.json")));
  return { recorded: asString(scenes.textVersion), current: asString(book.textVersion) ?? "" };
}

export function classifyKeys(dir: string): StepKeys {
  const book = asRecord(readJson(join(dir, "book.json")));
  const scenes = asRecord(readJson(join(dir, "scenes.json")));
  const analysis = asRecord(readJson(join(dir, "analysis.json")));
  const list = Array.isArray(scenes.scenes) ? (scenes.scenes as { id: unknown; ch: unknown; start_n: unknown; end_n: unknown; title: unknown; summary: unknown; characters: unknown }[]) : undefined;
  return { recorded: asString(asRecord(analysis.provenance).input), current: list === undefined ? "" : classifyInputOf(list, asString(book.textVersion) ?? "") };
}

export function resplitKeys(dir: string): StepKeys {
  const book = asRecord(readJson(join(dir, "book.json")));
  const analysis = asRecord(readJson(join(dir, "analysis.json")));
  const list = Array.isArray(analysis.scenes) ? (analysis.scenes as { id: unknown; start_n: unknown; end_n: unknown }[]) : undefined;
  return { recorded: asString(asRecord(asRecord(analysis.provenance).resplit).input), current: list === undefined ? "" : resplitInputOf(list, asString(book.textVersion) ?? "") };
}

export function clusterKeys(dir: string): StepKeys {
  const analysis = asRecord(readJson(join(dir, "analysis.json")));
  const clusters = asRecord(readJson(join(dir, "music-clusters.json")));
  const list = Array.isArray(analysis.scenes) ? (analysis.scenes as { id: unknown; final: unknown }[]) : undefined;
  return { recorded: asString(asRecord(clusters.provenance).input), current: list === undefined ? "" : clusterInputOf(list) };
}

export function narrateKeys(dir: string, voice: string = NARRATION_VOICE): StepKeys {
  const book = asRecord(readJson(join(dir, "book.json")));
  let recorded: string | undefined;
  try {
    const file = parseBookNarration(readJson(join(dir, "narration.json")));
    const input = file.inputs[voice];
    recorded = typeof input === "string" ? input : undefined;
  } catch {
    recorded = undefined;
  }
  return {
    recorded,
    current: narrateInputOf(asString(book.textVersion) ?? "", voice, NARRATION_MODEL, NARRATION_SPEED, NARRATION_FORMAT),
  };
}

export type FreshStep = "segment" | "classify" | "resplit" | "cluster" | "narrate";

const STEP_ORDER: FreshStep[] = ["segment", "classify", "resplit", "cluster", "narrate"];

const STEP_KEYS: Record<FreshStep, (dir: string) => StepKeys> = {
  segment: segmentKeys,
  classify: classifyKeys,
  resplit: resplitKeys,
  cluster: clusterKeys,
  narrate: narrateKeys,
};

export interface StepPlan {
  step: FreshStep;
  reuse: boolean;
  reason: string;
}

// Plans the selected steps in pipeline order. Once a step would redo,
// every later step redoes too, since its input comes from that step.
export function planSteps(dir: string, steps: FreshStep[], force: boolean): StepPlan[] {
  const wanted = STEP_ORDER.filter((step) => steps.includes(step));
  const plans: StepPlan[] = [];
  let upstreamRedoes = false;
  for (const step of wanted) {
    if (upstreamRedoes) {
      plans.push({ step, reuse: false, reason: "upstream step redoes" });
      continue;
    }
    const keys = STEP_KEYS[step](dir);
    const decision = decide(force, keys.recorded, keys.current);
    if (!decision.reuse) upstreamRedoes = true;
    plans.push({ step, ...decision });
  }
  return plans;
}
