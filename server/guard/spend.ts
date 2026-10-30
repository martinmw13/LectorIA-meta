import "server-only";
import type { KV } from "@/core/types";

export function spendKey(): string {
  return "img:spend:micro";
}

// Daily spend counter for our key. The day is the UTC day string
// YYYY-MM-DD the caller already uses for quota keys, so the daily
// cap resets on UTC rollover together with per-person quota.
export const DAILY_SPEND_TTL_SEC = 48 * 3600;

export function dailySpendKey(day: string): string {
  return `img:spend:daily:${day}`;
}

export function budgetExceeded(totalAfterReserve: number, capMicro: number): boolean {
  return totalAfterReserve > capMicro;
}

export interface SpendReservation {
  amountMicro: number;
  day: string;
  // Gives back each counter at most once: a flag clears only after
  // its write lands. Best effort, never throws.
  release(): Promise<void>;
  // Post-stream reconciliation: folds the real cost into both counters.
  // Best effort, never throws.
  adjust(deltaMicro: number): Promise<void>;
}

export interface ReserveSpendArgs {
  amountMicro: number;
  day: string;
  spendCapMicro: number;
  dailySpendCapMicro: number;
  // Overrides the daily counter key (uploads keep their own daily cap);
  // the total key is always shared. Absent means the image/chat key.
  dailyKey?: string;
}

// One reserve for both caps: total first with an expiry refresh on the
// daily counter, refunding what was taken on over-cap. A Redis failure
// between reserves refunds the total, then rethrows for the caller to
// map to unavailable. Only over-cap returns ok: false.
export async function reserveSpend(
  kv: KV,
  args: ReserveSpendArgs,
): Promise<{ ok: true; reservation: SpendReservation } | { ok: false; which: "total" | "daily" }> {
  const totalKey = spendKey();
  const dayKey = args.dailyKey ?? dailySpendKey(args.day);
  let totalLeft = false;
  let dailyLeft = false;
  const releaseTotal = async (): Promise<void> => {
    try {
      if (totalLeft) {
        await kv.decrBy(totalKey, args.amountMicro);
        totalLeft = false;
      }
    } catch {
      // Redis down: nothing reserved server-side to retry against.
    }
  };
  const releaseDaily = async (): Promise<void> => {
    try {
      if (dailyLeft) {
        await kv.decrBy(dayKey, args.amountMicro);
        dailyLeft = false;
      }
    } catch {
      // Redis down: nothing reserved server-side to retry against.
    }
  };

  const total = await kv.incrBy(totalKey, args.amountMicro);
  totalLeft = true;
  if (budgetExceeded(total, args.spendCapMicro)) {
    await releaseTotal();
    return { ok: false, which: "total" };
  }

  let dailyTotal: number;
  try {
    dailyTotal = await kv.incrBy(dayKey, args.amountMicro);
    dailyLeft = true;
    await kv.expire(dayKey, DAILY_SPEND_TTL_SEC);
  } catch (e) {
    // A Redis failure between reserves must give back what was taken.
    await releaseDaily();
    await releaseTotal();
    throw e;
  }
  if (budgetExceeded(dailyTotal, args.dailySpendCapMicro)) {
    await releaseDaily();
    await releaseTotal();
    return { ok: false, which: "daily" };
  }

  // Refunds the day that was charged, even if the job crosses UTC midnight.
  return {
    ok: true,
    reservation: {
      amountMicro: args.amountMicro,
      day: args.day,
      release: async () => {
        await releaseDaily();
        await releaseTotal();
      },
      adjust: async (deltaMicro: number) => {
        if (deltaMicro === 0) return;
        try {
          await kv.incrBy(totalKey, deltaMicro);
          await kv.incrBy(dayKey, deltaMicro);
        } catch {
          // Best effort: the reserve already bounds the spend.
        }
      },
    },
  };
}
