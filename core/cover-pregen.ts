// Pure planning and spend-capped runner for scripts/pregen-covers.ts.
// No fs, no env, no network: the script injects exists/write/generate,
// so vitest covers the resume, skip, and cap logic with fakes.
import type { ImageStyle } from "./image-style";
import { buildCoverPrompt, coverPublicPath, coverStyleForSkin, isCoverSkin } from "./cover-prompt";

export interface CoverSubject {
  bookId: string;
  title: string;
  author: string;
  coverDescription: string;
}

export interface CoverTask {
  bookId: string;
  skin: string;
  style: ImageStyle | undefined;
  prompt: string;
  path: string;
}

export function resolveCoverBooks(bookArg: string | undefined, shelfIds: string[]): string[] {
  const valid = [...shelfIds, "all-shelf"].join(", ");
  if (bookArg === undefined || bookArg === "all-shelf") return [...shelfIds];
  if (shelfIds.includes(bookArg)) return [bookArg];
  throw new Error(`unknown book: ${bookArg} (one of: ${valid})`);
}

export function resolveCoverSkins(styleArg: string | undefined, skins: string[]): string[] {
  const valid = [...skins, "all"].join(", ");
  if (styleArg === undefined || styleArg === "all") return [...skins];
  if (skins.includes(styleArg) && isCoverSkin(styleArg)) return [styleArg];
  throw new Error(`unknown style: ${styleArg} (one of: ${valid})`);
}

// Every book x skin pair with its prompt. Pairs already on disk are
// reported as skipped, so a rerun resumes where it stopped.
export function planCoverTasks(args: {
  subjects: CoverSubject[];
  skins: string[];
  exists: (diskPath: string) => boolean;
}): { tasks: CoverTask[]; skipped: number } {
  const tasks: CoverTask[] = [];
  let skipped = 0;
  for (const subject of args.subjects) {
    for (const skin of args.skins) {
      const path = `public${coverPublicPath(skin, subject.bookId)}`;
      if (args.exists(path)) {
        skipped++;
        continue;
      }
      const style = coverStyleForSkin(skin);
      tasks.push({
        bookId: subject.bookId,
        skin,
        style,
        prompt: buildCoverPrompt({
          book: { id: subject.bookId, title: subject.title, author: subject.author },
          coverDescription: subject.coverDescription,
          style,
        }),
        path,
      });
    }
  }
  return { tasks, skipped };
}

export interface CoverRunResult {
  generated: number;
  failed: number;
  stoppedAtCap: boolean;
}

// Spend-capped pool. Dry-run callers pass an empty task list and only
// read the plan; the cap counts one image cost per successful generate.
export async function runCoverTasks(args: {
  tasks: CoverTask[];
  capMicro: number;
  costMicro: number;
  concurrency: number;
  generate: (prompt: string) => Promise<Uint8Array>;
  write: (diskPath: string, bytes: Uint8Array) => Promise<void> | void;
}): Promise<CoverRunResult> {
  let generated = 0;
  let failed = 0;
  let stoppedAtCap = false;
  let spent = 0;
  let next = 0;
  const workers = Math.max(1, Math.floor(args.concurrency));
  async function worker(): Promise<void> {
    while (next < args.tasks.length && !stoppedAtCap) {
      const task = args.tasks[next++];
      if (!task) return;
      if (spent + args.costMicro > args.capMicro) {
        stoppedAtCap = true;
        return;
      }
      spent += args.costMicro;
      let bytes: Uint8Array;
      try {
        bytes = await args.generate(task.prompt);
      } catch {
        spent -= args.costMicro;
        failed++;
        continue;
      }
      try {
        await args.write(task.path, bytes);
      } catch {
        spent -= args.costMicro;
        failed++;
        continue;
      }
      generated++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, args.tasks.length) }, () => worker()));
  return { generated, failed, stoppedAtCap };
}

export function parseCapUsd(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
