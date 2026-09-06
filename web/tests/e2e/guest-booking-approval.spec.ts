import { test, expect } from '@playwright/test';

test.describe('Guest Booking API', () => {
  test('returns 403 Forbidden for non-admin users', async ({ request }) => {
    const response = await request.patch('/api/guest-booking-requests/00000000-0000-0000-0000-000000000000', {
      data: { action: 'approve' }
    });
    
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error).toBe('Forbidden');
  });
});
