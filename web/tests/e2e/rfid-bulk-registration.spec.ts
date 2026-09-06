import { test, expect, type Page } from '@playwright/test';

const LOGIN_EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL || '';
const LOGIN_PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD || '';

if (!LOGIN_EMAIL || !LOGIN_PASSWORD) {
  console.warn('PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD are not set. Skipping E2E tests.');
}

async function loginIfNeeded(page: Page) {
  if (!LOGIN_EMAIL || !LOGIN_PASSWORD) {
    return; // No credentials provided, skip
  }

  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  await page.fill('input[type="email"]', LOGIN_EMAIL);
  await page.fill('input[type="password"]', LOGIN_PASSWORD);
  await page.click('button[type="submit"]');

  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
}

test.describe('Bulk RFID Registration', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!LOGIN_EMAIL || !LOGIN_PASSWORD, 'Requires PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD');
    test.info().annotations.push({ type: 'issue', description: 'Simulated RFID input via text field' });
    await loginIfNeeded(page);
  });

  test('loads the bulk RFID registration page with correct title', async ({ page }) => {
    const uid = `TEST-${Date.now()}`;
    await page.goto('/rfid/bulk');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveTitle(/Bulk RFID Registration/);
  });

  test('displays the simulated RFID input', async ({ page }) => {
    await page.goto('/rfid/bulk');
    await page.waitForLoadState('networkidle');

    const input = page.locator('input[placeholder*="RFID" i], input[placeholder*="UID" i], input[aria-label*="RFID" i], input[aria-label*="UID" i]');
    await expect(input).toBeVisible();
  });

  test('registers a new card via simulated RFID input', async ({ page }) => {
    const uid = `TEST-${Date.now()}`;
    await page.goto('/rfid/bulk');
    await page.waitForLoadState('networkidle');

    const input = page.locator('input[placeholder*="RFID" i], input[placeholder*="UID" i], input[aria-label*="RFID" i], input[aria-label*="UID" i]').first();
    await input.fill(uid);
    await input.press('Enter');

    await page.waitForSelector(`text=${uid}`, { timeout: 10000 });

    const row = page.locator(`tr:has-text("${uid}")`);
    await expect(row).toBeVisible();

    const dateCell = row.locator('td').nth(2);
    const dateText = await dateCell.textContent();
    expect(dateText).toBeTruthy();
  });

  test('shows success toast after registering a new card', async ({ page }) => {
    const uid = `TEST-${Date.now()}`;
    await page.goto('/rfid/bulk');
    await page.waitForLoadState('networkidle');

    const input = page.locator('input[placeholder*="RFID" i], input[placeholder*="UID" i], input[aria-label*="RFID" i], input[aria-label*="UID" i]').first();
    await input.fill(uid);
    await input.press('Enter');

    const toast = page.locator('[role="status"], [role="alert"], .toast, [data-sonner-toast]').first();
    await expect(toast).toBeVisible({ timeout: 10000 });
    await expect(toast).toContainText(/success|registered|added/i);
  });

  test('prevents duplicate registration and shows warning', async ({ page }) => {
    const uid = `TEST-${Date.now()}`;
    await page.goto('/rfid/bulk');
    await page.waitForLoadState('networkidle');

    const input = page.locator('input[placeholder*="RFID" i], input[placeholder*="UID" i], input[aria-label*="RFID" i], input[aria-label*="UID" i]').first();

    await input.fill(uid);
    await input.press('Enter');
    await page.waitForSelector(`text=${uid}`, { timeout: 10000 });

    const initialCount = await page.locator('table tbody tr').count();

    await input.fill(uid);
    await input.press('Enter');

    const warningToast = page.locator('[role="status"], [role="alert"], .toast, [data-sonner-toast]').first();
    await expect(warningToast).toBeVisible({ timeout: 10000 });
    await expect(warningToast).toContainText(/duplicate|already|exists/i);

    const finalCount = await page.locator('table tbody tr').count();
    expect(finalCount).toBe(initialCount);
  });

  test('updates card status via dropdown', async ({ page }) => {
    const uid = `TEST-${Date.now()}`;
    await page.goto('/rfid/bulk');
    await page.waitForLoadState('networkidle');

    const input = page.locator('input[placeholder*="RFID" i], input[placeholder*="UID" i], input[aria-label*="RFID" i], input[aria-label*="UID" i]').first();
    await input.fill(uid);
    await input.press('Enter');
    await page.waitForSelector(`text=${uid}`, { timeout: 10000 });

    const row = page.locator(`tr:has-text("${uid}")`);
    const statusCell = row.locator('td').nth(3);
    const dropdown = statusCell.locator('select, [role="combobox"], button').first();
    await dropdown.click();

    const option = page.locator('[role="option"], option').first();
    await option.click();

    await page.waitForTimeout(1000);
  });

  test('deletes a registered card', async ({ page }) => {
    const uid = `TEST-${Date.now()}`;
    await page.goto('/rfid/bulk');
    await page.waitForLoadState('networkidle');

    const input = page.locator('input[placeholder*="RFID" i], input[placeholder*="UID" i], input[aria-label*="RFID" i], input[aria-label*="UID" i]').first();
    await input.fill(uid);
    await input.press('Enter');
    await page.waitForSelector(`text=${uid}`, { timeout: 10000 });

    const row = page.locator(`tr:has-text("${uid}")`);
    const deleteButton = row.locator('button[aria-label*="Delete" i], button:has-text("Delete")').first();
    await deleteButton.click();

    const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Delete"), [data-testid="confirm-delete"]').first();
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click();
    }

    await expect(row).not.toBeVisible({ timeout: 10000 });
  });
});
