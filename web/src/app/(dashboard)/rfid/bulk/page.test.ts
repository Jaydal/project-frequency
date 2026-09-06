import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/app/(dashboard)/rfid/bulk/page.tsx'), 'utf8');

describe('bulk RFID page metadata', () => {
  it('declares the Paddle Point page title', () => {
    expect(source).toContain("title: 'Bulk RFID Registration | Paddle Point'");
  });
});
