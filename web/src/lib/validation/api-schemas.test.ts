import { describe, expect, it } from 'vitest';
import { bookingSchema, queueJoinSchema } from './api-schemas';

const member = '550e8400-e29b-41d4-a716-446655440000';

describe('booking and queue schemas', () => {
  it('accepts bounded, supported booking input', () => {
    const result = bookingSchema.safeParse({
      memberId: member,
      start: '2026-08-30T14:00:00Z',
      duration: 60,
      partySize: 2,
      playerIds: [member],
      matchTitle: 'Court booking',
    });
    expect(result.success).toBe(true);
  });

  it.each([30, 60, 90, 120])('accepts configured duration: %i minutes', (d) => {
    const result = queueJoinSchema.safeParse({
      memberId: member,
      start: '2026-08-30T14:00:00Z',
      duration: d,
      partySize: 2,
      playerIds: [member],
    });
    expect(result.success).toBe(true);
  });

  it.each([
    { duration: -1 },
    { duration: 999 },
    { partySize: 3 },
    { playerIds: ['not-a-uuid'] },
    { matchTitle: 'x'.repeat(121) },
  ])('rejects unsafe booking field: %j', (override) => {
    const result = bookingSchema.safeParse({
      memberId: member,
      start: '2026-08-30T14:00:00Z',
      duration: 60,
      partySize: 2,
      playerIds: [member],
      ...override,
    });
    expect(result.success).toBe(false);
  });

  it('rejects queue input with too many players or an invalid court id', () => {
    const result = queueJoinSchema.safeParse({
      memberId: member,
      start: '2026-08-30T14:00:00Z',
      duration: 60,
      partySize: 2,
      playerIds: [member, member, member, member, member],
      courtId: 'court/1',
    });
    expect(result.success).toBe(false);
  });
});
