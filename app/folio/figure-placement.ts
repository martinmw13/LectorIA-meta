// Figure placement and picture request rules for one scene. Pure:
// no React, no DOM, no network. book-view.tsx owns the DOM side
// (scroll, pulse) and use-pictures.ts owns the requests.
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
// it is the last visible fragment of its ordinal on this page. Each page
// renders after its own last visible fragment, so a paragraph split
// across two pages shows its figures on both.
export function figuresAfter<P extends { n: number }, F>(
  paragraphs: P[],
  i: number,
  grouped: Map<number, F[]>,
): F[] {
  const cur = paragraphs[i];
  if (!cur) return [];
  return paragraphs[i + 1]?.n !== cur.n ? (grouped.get(cur.n) ?? []) : [];
}

// One request at a time across scene and figure: `busy` is whether
// use-pictures.ts has a request in flight.
// A figure retries only from the error phase, never while busy.
export function canRetryFigure<F extends { phase: string }>(figure: F | undefined, busy: boolean): figure is F {
  return !busy && figure?.phase === "error";
}

// A scene illustrates only with an id, no request in flight, nothing cached.
export function canIllustrateScene(args: { sceneId: string; busy: boolean; cached: boolean }): boolean {
  return args.sceneId !== "" && !args.busy && !args.cached;
}
