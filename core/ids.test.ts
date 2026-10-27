import { describe, expect, it } from 'vitest';
import { paragraphId, parseParagraphId } from '@/core/ids';

describe('paragraphId', () => {
  it('formats chapter and paragraph', () => {
    expect(paragraphId(12, 34)).toBe('c12p34');
    expect(paragraphId(1, 1)).toBe('c1p1');
  });

  it('rejects non-positive or non-integer input', () => {
    for (const [c, p] of [[0, 1], [1, 0], [-2, 3], [1.5, 2], [2, NaN]] as const) {
      expect(() => paragraphId(c, p)).toThrow(RangeError);
    }
  });

  it('round-trips through parseParagraphId', () => {
    expect(parseParagraphId(paragraphId(12, 34))).toEqual({ chapter: 12, para: 34 });
  });
});

describe('parseParagraphId', () => {
  it('parses valid ids', () => {
    expect(parseParagraphId('c1p1')).toEqual({ chapter: 1, para: 1 });
  });

  it('returns null for invalid ids', () => {
    for (const id of ['', 'c0p1', 'c1p0', 'c12', 'p34', 'c1p2p3', 'C1P2', 'c-1p2', 'c01x', 'unknown']) {
      expect(parseParagraphId(id)).toBeNull();
    }
  });
});
