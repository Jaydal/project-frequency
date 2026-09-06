import { describe, expect, it } from 'vitest';
import { isPublicPath } from './public-routes';

describe('Supabase middleware public route handling', () => {
  it('recognizes the landing page without requiring Supabase Auth', () => {
    expect(isPublicPath('/')).toBe(true);
  });

  it('keeps protected dashboard routes session-protected', () => {
    expect(isPublicPath('/bookings')).toBe(false);
  });
});
