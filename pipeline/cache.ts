// Skip-if-fresh check shared by the steps that write versioned JSON:
// return the parsed file when its textVersion matches, else null.
import { readFileSync } from "node:fs";

export function readIfFresh<T extends { textVersion: string }>(path: string, textVersion: string): T | null {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed.textVersion === textVersion ? parsed : null;
  } catch {
    return null;
  }
}
