import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/app/(dashboard)/rfid/bulk/bulk-register-client.tsx'), 'utf8');

describe('bulk RFID validation feedback', () => {
  it('branches on the typed assignment result instead of server-action error text', () => {
    expect(source).toContain("result.code === 'RFID_ALREADY_ASSIGNED'");
    expect(source).toContain("result.code === 'RFID_ALREADY_UNASSIGNED'");
    expect(source).not.toContain("err.message?.includes('already')");
  });

  it('counts thrown import failures separately from skipped rows', () => {
    expect(source).toContain('let failedCount = 0');
    expect(source).toContain('failedCount++');
    expect(source).toContain('failedCount} failed');
  });
});
