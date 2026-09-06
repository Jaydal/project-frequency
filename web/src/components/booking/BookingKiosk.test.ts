import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/booking/BookingKiosk.tsx'), 'utf8');

describe('terminal schedule flow', () => {
  it('enables scheduled mode before entering date and time selection', () => {
    expect(source).toContain("onClick={() => { setScheduleMode(true); setStep('select-schedule-datetime'); }}");
  });

  it('uses the terminal member API memberId field', () => {
    expect(source).toContain('memberId: memberData.memberId');
    expect(source).not.toContain('memberId: memberData.member_id');
  });

  it('authenticates and validates decline responses before resetting', () => {
    const declineHandler = source.slice(
      source.indexOf('async function handleDeclineOffer()'),
      source.indexOf('async function handleCancelQueue()'),
    );

    expect(declineHandler).toContain("...(terminalToken ? { 'x-terminal-token': terminalToken } : {})");
    expect(declineHandler).toContain('if (!res.ok)');
    expect(declineHandler).toContain("setStep('error')");
    expect(declineHandler.indexOf('if (!res.ok)')).toBeLessThan(declineHandler.indexOf('reset();'));
  });

  it('associates schedule controls with accessible labels', () => {
    expect(source).toContain('htmlFor="schedule-date"');
    expect(source).toContain('id="schedule-date"');
    expect(source).toContain('htmlFor="schedule-time"');
    expect(source).toContain('id="schedule-time"');
  });
});
