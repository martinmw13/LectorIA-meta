// Figure placement and picture request rules for one scene. Pure:
// no React, no DOM, no network. scene-page.tsx owns the DOM side
// (setPage, scroll, pulse) and use-pictures.ts owns the requests.
export function groupFiguresByEndN<F extends { endN: number }>(figures: F[]): Map<number, F[]> {
  const grouped = new Map<number, F[]>();
  for (const fig of figures) {
    const list = grouped.get(fig.endN) ?? [];
    list.push(fig);
    grouped.set(fig.endN, list);
  }
  return grouped;
}

// Figures to render after paragraph i of the visible sub-page: only when
// it is the last visible fragment of its ordinal on this page. A paragraph
// split across pages shows its figures only on the page holding its last
// visible fragment there.
export function figuresAfter<P extends { n: number }, F>(
  paragraphs: P[],
  i: number,
  grouped: Map<number, F[]>,
): F[] {
  const cur = paragraphs[i];
  if (!cur) return [];
  return paragraphs[i + 1]?.n !== cur.n ? (grouped.get(cur.n) ?? []) : [];
}

// Index of the sub-page holding paragraph ordinal n, -1 when none.
export function pageOfOrdinal<P extends { n: number }>(pages: { paragraphs: P[] }[], n: number): number {
  return pages.findIndex((p) => p.paragraphs.some((para) => para.n === n));
}

// One request at a time across scene and figure. The flag lives in the
// caller's ref; these are the only transitions.
export function tryStart(gate: { current: boolean }): boolean {
  if (gate.current) return false;
  gate.current = true;
  return true;
}

export function finish(gate: { current: boolean }): void {
  gate.current = false;
}

export function canStart(busy: boolean): boolean {
  return !busy;
}

// A figure retries only from the error phase, never while busy.
export function canRetryFigure<F extends { phase: string }>(figure: F | undefined, busy: boolean): figure is F {
  return !busy && figure?.phase === "error";
}

// A scene illustrates only with an id, no request in flight, nothing cached.
export function canIllustrateScene(args: { sceneId: string; busy: boolean; cached: boolean }): boolean {
  return args.sceneId !== "" && !args.busy && !args.cached;
}
