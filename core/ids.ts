// Global paragraph ids, like `c12p34`. Chapter and paragraph are positive integers.
export function paragraphId(chapter: number, para: number): string {
  if (!Number.isInteger(chapter) || chapter < 1 || !Number.isInteger(para) || para < 1) {
    throw new RangeError(`paragraphId needs positive integers, got ${chapter}, ${para}`);
  }
  return `c${chapter}p${para}`;
}

const ID_RE = /^c(\d+)p(\d+)$/;

// Parse an id back into chapter/para, or null when it is not a valid id.
export function parseParagraphId(id: string): { chapter: number; para: number } | null {
  const m = ID_RE.exec(id);
  if (!m) return null;
  const chapter = Number(m[1]);
  const para = Number(m[2]);
  if (!Number.isSafeInteger(chapter) || chapter < 1 || !Number.isSafeInteger(para) || para < 1) {
    return null;
  }
  return { chapter, para };
}
