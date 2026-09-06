import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/app/(dashboard)/rfid/assign-rfid-dialog.tsx'), 'utf8');

describe('RFID assignment dialog feedback', () => {
  it('handles typed assignRFID validation results before closing the dialog', () => {
    const handler = source.slice(
      source.indexOf('const handleSubmit = async (e: React.FormEvent) => {'),
      source.indexOf('return (', source.indexOf('const handleSubmit = async (e: React.FormEvent) => {')),
    );

    expect(handler).toContain('const result = await assignRFID');
    expect(handler).toContain('if (!result.ok)');
    expect(handler).toContain('result.message');
  });

  it('associates the member search label with its input', () => {
    expect(source).toContain('<Label htmlFor="member-search">Assign to Member (optional)</Label>');
    expect(source).toContain('<Input id="member-search"');
  });
});
