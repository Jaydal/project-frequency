import { describe, expect, it } from 'vitest';
import { checkRateLimit, checkWindowRateLimit } from './rate-limit';

describe('rate-limit', () => {
  it('enforces cooldown-based rate limit', () => {
    const key = 'test-cooldown-' + Math.random();
    expect(checkRateLimit(key, 1000)).toBe(true);
    expect(checkRateLimit(key, 1000)).toBe(false);
  });

  it('enforces window-based rate limit', () => {
    const key = 'test-window-' + Math.random();
    expect(checkWindowRateLimit(key, 2, 1000)).toBe(true);
    expect(checkWindowRateLimit(key, 2, 1000)).toBe(true);
    expect(checkWindowRateLimit(key, 2, 1000)).toBe(false);
  });
});
