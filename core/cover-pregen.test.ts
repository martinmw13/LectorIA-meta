import { describe, expect, it } from "vitest";
import {
  parseCapUsd,
  planCoverTasks,
  resolveCoverBooks,
  resolveCoverSkins,
  runCoverTasks,
  type CoverSubject,
} from "./cover-pregen";

const SUBJECTS: CoverSubject[] = [
  { bookId: "oz", title: "Oz", author: "Baum", coverDescription: "A cyclone lifts a house." },
  { bookId: "alice", title: "Alice", author: "Carroll", coverDescription: "A rabbit hole." },
];
const SKINS = ["engraving", "comic"];

describe("resolveCoverBooks", () => {
  it("defaults to the whole shelf and accepts one id", () => {
    expect(resolveCoverBooks(undefined, ["oz", "alice"])).toEqual(["oz", "alice"]);
    expect(resolveCoverBooks("all-shelf", ["oz", "alice"])).toEqual(["oz", "alice"]);
    expect(resolveCoverBooks("oz", ["oz", "alice"])).toEqual(["oz"]);
  });

  it("rejects unknown books", () => {
    expect(() => resolveCoverBooks("moby", ["oz"])).toThrow("unknown book");
  });
});

describe("resolveCoverSkins", () => {
  it("defaults to all skins and accepts one skin", () => {
    expect(resolveCoverSkins(undefined, SKINS)).toEqual(SKINS);
    expect(resolveCoverSkins("all", SKINS)).toEqual(SKINS);
    expect(resolveCoverSkins("comic", SKINS)).toEqual(["comic"]);
  });

  it("rejects unknown styles", () => {
    expect(() => resolveCoverSkins("nope", SKINS)).toThrow("unknown style");
  });
});

describe("planCoverTasks", () => {
  it("skips covers already on disk so reruns resume", () => {
    const { tasks, skipped } = planCoverTasks({
      subjects: SUBJECTS,
      skins: SKINS,
      exists: (p) => p === "public/covers/v1/engraving/oz.webp",
    });
    expect(skipped).toBe(1);
    expect(tasks).toHaveLength(3);
    expect(tasks.map((t) => t.path)).not.toContain("public/covers/v1/engraving/oz.webp");
  });

  it("builds one prompt per missing pair", () => {
    const { tasks } = planCoverTasks({ subjects: SUBJECTS.slice(0, 1), skins: ["comic"], exists: () => false });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.prompt).toContain("cyclone");
    expect(tasks[0]?.path).toBe("public/covers/v1/comic/oz.webp");
  });
});

describe("runCoverTasks", () => {
  function tasks(n: number) {
    return planCoverTasks({ subjects: SUBJECTS, skins: SKINS.slice(0, 1), exists: () => false }).tasks.slice(0, n);
  }

  it("stops at the USD cap without spending over it", async () => {
    let calls = 0;
    const result = await runCoverTasks({
      tasks: tasks(2),
      capMicro: 10_000,
      costMicro: 10_000,
      concurrency: 1,
      generate: async () => {
        calls++;
        return new Uint8Array([1]);
      },
      write: async () => {},
    });
    expect(result).toEqual({ generated: 1, failed: 0, stoppedAtCap: true });
    expect(calls).toBe(1);
  });

  it("refunds failures so they do not consume the cap", async () => {
    const result = await runCoverTasks({
      tasks: tasks(2),
      capMicro: 10_000,
      costMicro: 10_000,
      concurrency: 1,
      generate: async (prompt) => {
        if (prompt.includes("cyclone")) throw new Error("meta down");
        return new Uint8Array([1]);
      },
      write: async () => {},
    });
    expect(result.generated).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.stoppedAtCap).toBe(false);
  });

  it("counts a write failure without keeping the spend", async () => {
    const result = await runCoverTasks({
      tasks: tasks(1),
      capMicro: 10_000,
      costMicro: 10_000,
      concurrency: 1,
      generate: async () => new Uint8Array([1]),
      write: async () => {
        throw new Error("disk full");
      },
    });
    expect(result).toEqual({ generated: 0, failed: 1, stoppedAtCap: false });
  });
});

describe("parseCapUsd", () => {
  it("falls back on missing or bad input", () => {
    expect(parseCapUsd(undefined, 1)).toBe(1);
    expect(parseCapUsd("", 1)).toBe(1);
    expect(parseCapUsd("nope", 1)).toBe(1);
    expect(parseCapUsd("2.5", 1)).toBe(2.5);
  });
});

describe("runCoverTasks policy fallback", () => {
  it("retries once with the generic prompt after a policy rejection and reports other failures", async () => {
    const [task] = planCoverTasks({ subjects: SUBJECTS, skins: SKINS.slice(0, 1), exists: () => false }).tasks;
    if (!task) throw new Error("expected a planned task");
    const seen: string[] = [];
    const failures: string[] = [];
    const result = await runCoverTasks({
      tasks: [task],
      capMicro: 1_000_000,
      costMicro: 10_000,
      concurrency: 1,
      isPolicyRejection: (e) => e instanceof Error && e.message === "policy",
      generate: async (prompt) => {
        seen.push(prompt);
        if (prompt === task.prompt) throw new Error("policy");
        return new Uint8Array([1]);
      },
      write: async () => {},
      onFailure: (_t, stage) => failures.push(stage),
    });
    expect(result.generated).toBe(1);
    expect(seen).toEqual([task.prompt, task.fallbackPrompt]);
    expect(failures).toEqual([]);
  });
});
