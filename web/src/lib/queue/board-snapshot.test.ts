import { describe, expect, it } from 'vitest';
import { isGameActiveAt } from './board-snapshot';

describe('board game visibility', () => {
  const now = new Date('2026-08-30T10:00:00.000Z');

  it('shows a game only between its start and end', () => {
    expect(isGameActiveAt({ start_time: '2026-08-30T09:30:00.000Z', duration: 60 }, now)).toBe(true);
    expect(isGameActiveAt({ start_time: '2026-08-30T10:30:00.000Z', duration: 60 }, now)).toBe(false);
    expect(isGameActiveAt({ start_time: '2026-08-30T08:00:00.000Z', duration: 60 }, now)).toBe(false);
  });
});
