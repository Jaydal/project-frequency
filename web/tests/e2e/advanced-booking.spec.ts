import { test, expect } from '@playwright/test';

test.describe('Advanced Booking', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/book');
  });

  test('shows booking page with courts and date picker', async ({ page }) => {
    await expect(page.locator('input[type="date"]')).toBeVisible();
    await expect(page.locator('select')).toHaveCount(2);
  });

  test('calls booking API without auth and gets 401', async ({ page }) => {
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courtId: 'court-1', start: '2026-08-28T08:00:00.000Z', duration: 60, partySize: 2, playerIds: [] }),
      });
      return r.status;
    });
    expect(res).toBe(401);
  });

  test('shows date picker with correct max date', async ({ page }) => {
    const dateInput = page.locator('input[type="date"]');
    await expect(dateInput).toBeVisible();
    const max = await dateInput.getAttribute('max');
    expect(max).toBeTruthy();
  });

  test('redirects to login when accessing bookings without auth', async ({ page }) => {
    await page.goto('/bookings');
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows estimated price before confirming', async ({ page }) => {
    const durationSelect = page.locator('select').first();
    await durationSelect.selectOption('60');
    await expect(page.locator('text=/Estimated cost: ₱/')).toBeVisible();
  });

  test('kiosk schedule booking flow', async ({ page }) => {
    // Mock the RFID lookup API
    await page.route('**/api/terminal/member/**', async route => {
      await route.fulfill({
        json: {
          id: 'mock-member-123',
          memberId: 'M123',
          firstName: 'Test',
          lastName: 'User',
          balance: 1000,
          token: 'mock-token'
        }
      });
    });
    
    // Mock the queue advance/booking submission
    await page.route('**/api/queue**', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: [] }); // return empty array for GET /api/queue?memberId=...
      } else {
        await route.fulfill({ json: { success: true, id: 'test-queue-123' } });
      }
    });

    // Mock courts endpoint
    await page.route('**/api/courts/status', async route => {
      await route.fulfill({ json: { "court-1": { status: "available" }, "court-2": { status: "available" } } });
    });
    
    // Mock prices endpoint
    await page.route('**/api/public/prices', async route => {
      await route.fulfill({ json: { "durations": [{"minutes":60,"price":100}], "gameTypes": [{"id":"singles","name":"Singles","multiplier":1}] } });
    });

    // Mock health endpoint
    await page.route('**/api/health', async route => {
      await route.fulfill({ json: { ok: true } });
    });

    // Mock settings endpoint
    await page.route('**/rest/v1/settings?*', async route => {
      await route.fulfill({ json: [] }); // return empty array for supabase settings
    });

    // Mock bookings endpoint
    await page.route('**/api/bookings**', async route => {
      await route.fulfill({ json: { id: 'test-booking', status: 'scheduled' } });
    });
    
    await page.goto('/booking?testmode=true');
    // Test RFID Input should be visible
    await expect(page.locator('text=Test RFID Input')).toBeVisible();
    
    // Enter member UID
    await page.locator('input[placeholder="Enter Card UID"]').fill('TEST001');
    await page.locator('button:has-text("Go")').click();

    // Welcome screen - Select Schedule
    await expect(page.locator('text=Welcome')).toBeVisible();
    await page.locator('button:has-text("Schedule")').click();

    // Select Date & Time
    await expect(page.locator('text=Select Date & Time')).toBeVisible();
    
    // Set a date 2 days in the future
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 2);
    const dateString = futureDate.toISOString().split('T')[0];
    
    await page.locator('input[type="date"]').fill(dateString);
    await page.locator('select').selectOption('09:00');
    await page.locator('button:has-text("Continue")').click();

    // Select Court
    await expect(page.locator('text=Where do you want to play?')).toBeVisible();
    await page.locator('button').filter({ hasText: 'Any Court' }).first().click();

    // Select Game
    await expect(page.locator('text=How do you want to play?')).toBeVisible();
    await page.locator('button:has-text("Singles")').click();

    // Select Duration
    await expect(page.locator('text=How long would you like to play?')).toBeVisible();
    await page.locator('button:has-text("60")').click();

    // Confirm Booking
    await expect(page.locator('text=Review Booking Details')).toBeVisible();
    await page.locator('button:has-text("Confirm & Book")').click();

    // Success screen
    await expect(page.locator('text=Booking Scheduled')).toBeVisible();
    await expect(page.locator('button:has-text("Done")')).toBeVisible();
  });
});
