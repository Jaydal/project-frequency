import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(process.cwd(), 'src');

describe('admin UI surface', () => {
  it('includes dedicated kiosk and guest request pages', () => {
    expect(existsSync(resolve(appRoot, 'app/(dashboard)/kiosks/page.tsx'))).toBe(true);
    expect(existsSync(resolve(appRoot, 'app/(dashboard)/guest-requests/page.tsx'))).toBe(true);
  });

  it('exposes guest requests from the admin sidebar', () => {
    const sidebar = readFileSync(resolve(appRoot, 'components/layout/sidebar.tsx'), 'utf8');
    expect(sidebar).toContain("href: '/guest-requests'");
    expect(sidebar).toContain("href: '/kiosks'");
  });

  it('does not leave the schedules placeholder in place', () => {
    const schedules = readFileSync(resolve(appRoot, 'app/(dashboard)/schedules/page.tsx'), 'utf8');
    expect(schedules).not.toContain('Advanced booking calendar view coming soon');
  });
});
