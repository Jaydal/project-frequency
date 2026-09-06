import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/app/(dashboard)/members/member-actions.tsx'), 'utf8');

describe('member RFID assignment feedback', () => {
  it('handles typed assignRFID validation results before closing the dialog', () => {
    const handler = source.slice(
      source.indexOf('const handleSubmit = async (e: React.FormEvent) => {'),
      source.indexOf('return (', source.indexOf('const handleSubmit = async (e: React.FormEvent) => {')),
    );

    expect(handler).toContain('const result = await assignRFID');
    expect(handler).toContain('if (!result.ok)');
    expect(handler).toContain('result.message');
  });
});
