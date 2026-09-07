import { describe, expect, it } from 'vitest';
import { buildCourtDisplays } from './queue-board-model';

describe('buildCourtDisplays', () => {
  it('shows a scheduled booking on its court before the start time', () => {
    const now = 1_700_000_000;
    const result = buildCourtDisplays(
      [{ id: 'court-1', name: 'Court 1' }],
      [{
        id: 'court-1',
        name: 'Court 1',
        matchType: '1v1',
        matchTitle: 'RFID booking',
        startTime: now + 600,
        durationMin: 60,
        players: [{ firstName: 'Test', lastName: 'M' }],
      }],
      now,
    );

    expect(result[0]).toMatchObject({
      status: 'Scheduled',
      matchTitle: 'RFID booking',
      start_time: new Date((now + 600) * 1000).toISOString(),
    });
  });

  it('shows In Progress when the scheduled start time has arrived', () => {
    const now = 1_700_000_600;
    const result = buildCourtDisplays(
      [{ id: 'court-1', name: 'Court 1' }],
      [{
        id: 'court-1',
        name: 'Court 1',
        matchType: '1v1',
        matchTitle: 'RFID booking',
        startTime: now - 300,
        durationMin: 60,
        players: [{ firstName: 'Test', lastName: 'M' }],
      }],
      now,
    );

    expect(result[0]).toMatchObject({
      status: 'In Progress',
      matchTitle: 'RFID booking',
      elapsed: 300,
      start_time: new Date((now - 300) * 1000).toISOString(),
    });
  });
});
