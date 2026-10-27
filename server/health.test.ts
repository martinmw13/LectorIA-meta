import { afterEach, describe, expect, it } from 'vitest';
import { health } from './health';

afterEach(() => {
  delete process.env.VERCEL_GIT_COMMIT_SHA;
});

describe('health', () => {
  it('returns ok with null commit when the env var is missing', () => {
    expect(health()).toEqual({ status: 'ok', commit: null });
  });

  it('truncates the commit SHA to 7 chars', () => {
    process.env.VERCEL_GIT_COMMIT_SHA = 'abcdef1234567890';
    expect(health()).toEqual({ status: 'ok', commit: 'abcdef1' });
  });
});
