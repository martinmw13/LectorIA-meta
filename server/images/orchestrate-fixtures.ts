import { createMemoryKV } from "@/core/images";
import type { ImageGenerator, ImageStore } from "@/core/images";
import type { PassageRequest } from "@/core/types";
import type { ImageEnv } from "./env";
import type { OrchestrateDeps } from "./orchestrate";

export const env: ImageEnv = {
  upstashUrl: "https://x",
  upstashToken: "t",
  metaKey: "m",
  sessionSecret: "s",
  ipSalt: "salt",
  spendCapMicro: 10_000_000,
  dailySpendCapMicro: 1_500_000,
};

export const content = {
  passageText: "Dorothy lived in the midst of the great Kansas prairies.",
  sceneTitle: "Gray Life on the Prairie",
  sceneClip: "Gray prairie and a small house.",
};

export const passage: PassageRequest = { kind: "passage", bookId: "oz", textVersion: "t", n: 3 };

export function deps(over: Partial<OrchestrateDeps> = {}): OrchestrateDeps {
  const files = new Map<string, Uint8Array>();
  const store: ImageStore = {
    findUrl: async (path) =>
      files.has(path) ? `https://blob.example/${path}` : null,
    save: async (path, bytes) => {
      if (files.has(path)) throw new Error("overwrite");
      files.set(path, bytes);
      return `https://blob.example/${path}`;
    },
  };
  const generate: ImageGenerator = {
    generate: async () => new Uint8Array([1, 2, 3]),
  };
  return {
    kv: createMemoryKV(),
    store,
    generate,
    env,
    content,
    ip: "1.2.3.4",
    anonId: "anon-1",
    day: "2026-10-27",
    sceneId: "s1",
    ...over,
  };
}
