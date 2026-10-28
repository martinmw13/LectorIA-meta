// Word timings are paragraph-relative char offsets (flat [start, end,
// t0, t1, ...] from the manifest), while the page renders fragments cut
// by paginateScene. This maps one fragment's slice of the timings into
// fragment-relative ranges for DOM Range building. Cuts land on spaces,
// so words never straddle fragments; offsets clip defensively.
export interface FragmentWord {
  start: number;
  end: number;
  t0: number;
  t1: number;
}

export function wordsInFragment(w: number[], from: number, fragLen: number): FragmentWord[] {
  const out: FragmentWord[] = [];
  for (let k = 0; k + 3 < w.length; k += 4) {
    const s = w[k] as number;
    const e = w[k + 1] as number;
    if (!(e > from && s < from + fragLen)) continue;
    out.push({
      start: Math.max(s, from) - from,
      end: Math.min(e, from + fragLen) - from,
      t0: w[k + 2] as number,
      t1: w[k + 3] as number,
    });
  }
  return out;
}
