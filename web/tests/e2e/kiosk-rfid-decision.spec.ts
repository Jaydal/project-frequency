import { test, expect } from '@playwright/test';

test.describe('Kiosk RFID Decision', () => {
  test('play now uncapped flow skips to select court', async ({ page }) => {
    // Mock the RFID lookup API
    await page.route('**/api/terminal/member/**', async route => {
      await route.fulfill({
        json: {
          id: 'mock-member-123',
          memberId: 'M123',
          firstName: 'Test',
          lastName: 'User',
          balance: 1000,
          token: 'mock-token',
          decision: {
            type: 'play now',
            courtId: 'court-1',
            duration: 60,
            capped: false
          }
        }
      });
    });

    // Mock settings
    await page.route('**/rest/v1/settings?*', async route => {
      await route.fulfill({ json: [] });
    });
    
    // Mock prices
    await page.route('**/api/public/prices', async route => {
      await route.fulfill({ json: { "durations": [{"minutes":60,"price":100}], "gameTypes": [{"id":"singles","name":"Singles","multiplier":1}] } });
    });

    await page.goto('/booking?testmode=true');
    await page.locator('input[placeholder="Enter Card UID"]').fill('TEST001');
    await page.locator('button:has-text("Go")').click();

    // Welcome screen - should see Play Now
    await expect(page.locator('text=Welcome, Test')).toBeVisible();
    await page.locator('button:has-text("Play Now")').click();

    // Uncapped should go to select court
    await expect(page.locator('text=Where do you want to play?')).toBeVisible();
  });

  test('play now capped flow skips duration', async ({ page }) => {
    // Mock the RFID lookup API
    await page.route('**/api/terminal/member/**', async route => {
      await route.fulfill({
        json: {
          id: 'mock-member-123',
          memberId: 'M123',
          firstName: 'Test',
          lastName: 'User',
          balance: 1000,
          token: 'mock-token',
          decision: {
            type: 'play now',
            courtId: 'court-1',
            duration: 30, // 45 mins capped snapped to 30 mins
            capped: true,
            cutoffTime: new Date(Date.now() + 45 * 60000).toISOString()
          }
        }
      });
    });

    // Mock settings
    await page.route('**/rest/v1/settings?*', async route => {
      await route.fulfill({ json: [] });
    });

    // Mock prices
    await page.route('**/api/public/prices', async route => {
      await route.fulfill({ json: { "durations": [{"minutes":60,"price":100}], "gameTypes": [{"id":"singles","name":"Singles","multiplier":1}] } });
    });

    await page.goto('/booking?testmode=true');
    await page.locator('input[placeholder="Enter Card UID"]').fill('TEST001');
    await page.locator('button:has-text("Go")').click();

    await expect(page.locator('text=Welcome, Test')).toBeVisible();
    await page.locator('button:has-text("Play Now")').click();

    // Capped should skip to select format (game type), assigning court-1 and duration 45 automatically
    await expect(page.locator('text=How do you want to play?')).toBeVisible();
    await page.locator('button:has-text("Singles")').click();

    // Should skip duration and go straight to confirm
    await expect(page.locator('text=Review Booking Details')).toBeVisible();
    // Verify the auto-selected duration
    await expect(page.locator('text=30 mins')).toBeVisible();
  });
});
