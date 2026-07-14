import { describe, it, expect } from 'vitest';
import { generatePayload } from './sports-caster';

describe('Sports Caster Payload Generator', () => {
  it('generates an OPEN payload when there is no current game and no queue', () => {
    const payload = generatePayload('court-1', {
      current: null,
      upcoming: []
    });
    
    expect(payload.courtId).toBe('court-1');
    expect(payload.state).toBe('OPEN');
    expect(payload.display.pages).toEqual([
      { text: "COURT 1 AVAILABLE", color: "#00FF00", effect: "SCROLL", durationSeconds: 10 },
      { text: "SCAN KIOSK TO PLAY", color: "#FFFFFF", effect: "SCROLL", durationSeconds: 5 }
    ]);
  });

  it('generates a PLAYING payload with no queue', () => {
    const payload = generatePayload('court-1', {
      current: { name: 'Jane vs John', startTime: '2026-07-13T18:00:00Z', durationMinutes: 30 },
      upcoming: []
    });
    
    expect(payload.state).toBe('PLAYING');
    expect(payload.display.pages[0].text).toBe('PLAYING: Jane vs John');
    expect(payload.display.pages[0].effect).toBe('SCROLL');
    expect(payload.display.pages[1].text).toBe('COURT OPEN AFTER THIS GAME');
  });

  it('generates a PLAYING payload with queue', () => {
    const payload = generatePayload('court-1', {
      current: { name: 'Jane vs John', startTime: '2026-07-13T18:00:00Z', durationMinutes: 30 },
      upcoming: [{ name: 'Team Alpha' }, { name: 'Team Beta' }]
    });
    
    expect(payload.state).toBe('PLAYING');
    expect(payload.display.pages[1].text).toBe('UP NEXT: Team Alpha');
    expect(payload.display.pages[2].text).toBe('2ND IN LINE: Team Beta');
  });
});
