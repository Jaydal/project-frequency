import { test, expect } from '@playwright/test';

test.describe('Advanced Booking', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/book');
  });

  test('shows booking page with courts and date picker', async ({ page }) => {
    await expect(page.locator('text=Court 1')).toBeVisible();
    await expect(page.locator('input[type="date"]')).toBeVisible();
  });

  test('redirects to login when booking without auth', async ({ page }) => {
    await page.click('button:has-text("Confirm Booking")');
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows time slots for selected date', async ({ page }) => {
    await page.fill('input[type="date"]', new Date(Date.now() + 86400000).toISOString().split('T')[0]);
    await page.click('text=Court 1');
    await expect(page.locator('text=08:00')).toBeVisible();
  });
});
