import { test, expect } from '@playwright/test';

test.describe('Active Game and Queue Management on Kiosk', () => {
  test('displays ongoing game, allows adding another booking or ending game early', async ({ page }) => {
    let gameEnded = false;

    await page.route('**/api/terminal/member/**', async route => {
      await route.fulfill({
        json: {
          id: 'member-001',
          memberId: 'MEM001',
          firstName: 'Alex',
          lastName: 'Smith',
          balance: 1500,
          token: 'token-abc',
          decision: {
            type: 'already active',
            courtId: 'court-1',
            gameId: 'game-101',
            courtName: 'Court 1'
          },
          activeGame: {
            id: 'game-101',
            courtId: 'court-1',
            courtName: 'Court 1',
            startTime: new Date().toISOString(),
            duration: 60
          },
          activeQueue: null
        }
      });
    });

    await page.route('**/api/terminal/game/end', async route => {
      gameEnded = true;
      await route.fulfill({ json: { ok: true, gameId: 'game-101' } });
    });

    await page.route('**/rest/v1/settings?*', async route => {
      await route.fulfill({ json: [] });
    });

    await page.route('**/api/public/prices', async route => {
      await route.fulfill({
        json: {
          durations: [{ minutes: 60, price: 100 }],
          gameTypes: [{ id: 'singles', name: 'Singles', multiplier: 1 }]
        }
      });
    });

    await page.goto('/booking?testmode=true');
    await page.locator('input[placeholder="Enter Card UID"]').fill('TEST001');
    await page.locator('button:has-text("Go")').click();

    // Verify Active Session Found screen
    await expect(page.locator('text=Active Session Found')).toBeVisible();
    await expect(page.locator('text=Ongoing Match')).toBeVisible();
    await expect(page.locator('text=Court 1')).toBeVisible();
    await expect(page.locator('button:has-text("End Game Early")')).toBeVisible();
    await expect(page.locator('button:has-text("Play Now / Queue Up")')).toBeVisible();
    await expect(page.locator('button:has-text("Schedule for Later")')).toBeVisible();

    // End game early
    await page.locator('button:has-text("End Game Early")').click();
    expect(gameEnded).toBe(true);
  });

  test('displays both ongoing game and queue ticket, allowing cancelling queue or scheduling', async ({ page }) => {
    let queueCancelled = false;

    await page.route('**/api/terminal/member/**', async route => {
      await route.fulfill({
        json: {
          id: 'member-001',
          memberId: 'MEM001',
          firstName: 'Alex',
          lastName: 'Smith',
          balance: 1500,
          token: 'token-abc',
          decision: {
            type: 'already active',
            courtId: 'court-1',
            gameId: 'game-101'
          },
          activeGame: {
            id: 'game-101',
            courtId: 'court-1',
            courtName: 'Court 1',
            startTime: new Date().toISOString(),
            duration: 60
          },
          activeQueue: {
            id: 'queue-202',
            courtId: 'court-1',
            courtName: 'Court 1',
            status: 'waiting',
            position: 1
          }
        }
      });
    });

    await page.route('**/api/queue/queue-202', async route => {
      queueCancelled = true;
      await route.fulfill({ json: { ok: true, cancelled: 'queue_entry' } });
    });

    await page.route('**/rest/v1/settings?*', async route => {
      await route.fulfill({ json: [] });
    });

    await page.route('**/api/public/prices', async route => {
      await route.fulfill({
        json: {
          durations: [{ minutes: 60, price: 100 }],
          gameTypes: [{ id: 'singles', name: 'Singles', multiplier: 1 }]
        }
      });
    });

    await page.goto('/booking?testmode=true');
    await page.locator('input[placeholder="Enter Card UID"]').fill('TEST001');
    await page.locator('button:has-text("Go")').click();

    // Verify Active Session Found screen displays both
    await expect(page.locator('text=Active Session Found')).toBeVisible();
    await expect(page.locator('text=Ongoing Match')).toBeVisible();
    await expect(page.getByText('Waiting List', { exact: true })).toBeVisible();
    await expect(page.locator('text=Position #1')).toBeVisible();
    await expect(page.locator('button:has-text("Cancel Queue")')).toBeVisible();
    await expect(page.locator('button:has-text("End Game Early")')).toBeVisible();

    // Rule 2: Queue Limit Reached notice is shown, and "Play Now" / "Schedule" are hidden
    await expect(page.locator('text=Queue Limit Reached')).toBeVisible();
    await expect(page.locator('button:has-text("Play Now / Queue Up")')).not.toBeVisible();
    await expect(page.locator('button:has-text("Schedule for Later")')).not.toBeVisible();

    // Cancel queue
    await page.locator('button:has-text("Cancel Queue")').click();
    expect(queueCancelled).toBe(true);

    // After cancelling queue, options to book again become available
    await expect(page.locator('button:has-text("Schedule for Later")')).toBeVisible();
    await page.locator('button:has-text("Schedule for Later")').click();
    await expect(page.locator('text=Select Date & Time')).toBeVisible();
  });

  test('caps duration to max 60 min when booking with an ongoing active game', async ({ page }) => {
    await page.route('**/api/terminal/member/**', async route => {
      await route.fulfill({
        json: {
          id: 'member-001',
          memberId: 'MEM001',
          firstName: 'Alex',
          lastName: 'Smith',
          balance: 1500,
          token: 'token-abc',
          decision: {
            type: 'already active',
            courtId: 'court-1',
            gameId: 'game-101',
            courtName: 'Court 1'
          },
          activeGame: {
            id: 'game-101',
            courtId: 'court-1',
            courtName: 'Court 1',
            startTime: new Date().toISOString(),
            duration: 60
          },
          activeQueue: null
        }
      });
    });

    await page.route('**/rest/v1/settings?*', async route => {
      await route.fulfill({
        json: [
          { key: 'products', value: JSON.stringify({ matchTypes: ['1v1', '2v2'], durations: [30, 60, 120] }) },
          { key: 'prices', value: JSON.stringify({ '30': 150, '60': 300, '120': 600 }) },
        ]
      });
    });

    await page.route('**/api/public/prices', async route => {
      await route.fulfill({
        json: {
          durations: [{ minutes: 30, price: 150 }, { minutes: 60, price: 300 }, { minutes: 120, price: 600 }],
          gameTypes: [{ id: 'singles', name: 'Singles', multiplier: 1 }]
        }
      });
    });

    await page.goto('/booking?testmode=true');
    await page.locator('input[placeholder="Enter Card UID"]').fill('TEST001');
    await page.locator('button:has-text("Go")').click();

    await expect(page.locator('text=Active Session Found')).toBeVisible();
    await page.locator('button:has-text("Play Now / Queue Up")').click();

    // Select Court
    await expect(page.locator('text=Where do you want to play?')).toBeVisible();
    await page.locator('button:has-text("Any Court")').click();

    // Select Game Type
    await expect(page.locator('text=How do you want to play?')).toBeVisible();
    await page.locator('button:has-text("Singles")').click();

    // Select Duration: verify 30 and 60 are shown, 120 is filtered out due to active game
    await expect(page.locator('text=How long would you like to play?')).toBeVisible();
    await expect(page.locator('text=Max 1 hour while currently in game (to give other players a turn).')).toBeVisible();
    await expect(page.locator('button', { hasText: '30' }).filter({ hasText: 'minutes' })).toBeVisible();
    await expect(page.locator('button', { hasText: '60' }).filter({ hasText: 'minutes' })).toBeVisible();
    await expect(page.locator('button', { hasText: '120' })).not.toBeVisible();
  });

  test('shows all durations including > 60 min when user has NO active game', async ({ page }) => {
    await page.route('**/api/terminal/member/**', async route => {
      await route.fulfill({
        json: {
          id: 'member-002',
          memberId: 'MEM002',
          firstName: 'Jordan',
          lastName: 'Lee',
          balance: 2000,
          token: 'token-xyz',
          decision: { type: 'play now' },
          activeGame: null,
          activeQueue: null
        }
      });
    });

    await page.route('**/rest/v1/settings?*', async route => {
      await route.fulfill({
        json: [
          { key: 'products', value: JSON.stringify({ matchTypes: ['1v1', '2v2'], durations: [30, 60, 120] }) },
          { key: 'prices', value: JSON.stringify({ '30': 150, '60': 300, '120': 600 }) },
        ]
      });
    });

    await page.route('**/api/public/prices', async route => {
      await route.fulfill({
        json: {
          durations: [{ minutes: 30, price: 150 }, { minutes: 60, price: 300 }, { minutes: 120, price: 600 }],
          gameTypes: [{ id: 'singles', name: 'Singles', multiplier: 1 }]
        }
      });
    });

    await page.goto('/booking?testmode=true');
    await page.locator('input[placeholder="Enter Card UID"]').fill('TEST002');
    await page.locator('button:has-text("Go")').click();

    // At rfid-decision step, choose Play Now
    await page.locator('button:has-text("Play Now")').click();

    // Directly at Select Court
    await expect(page.locator('text=Where do you want to play?')).toBeVisible();
    await page.locator('button:has-text("Any Court")').click();

    // Select Game Type
    await expect(page.locator('text=How do you want to play?')).toBeVisible();
    await page.locator('button:has-text("Singles")').click();

    // Select Duration: all durations (30, 60, 120) should be available
    await expect(page.locator('text=How long would you like to play?')).toBeVisible();
    await expect(page.locator('text=Pick a duration and review the credit requirement.')).toBeVisible();
    await expect(page.locator('button', { hasText: '30' }).filter({ hasText: 'minutes' })).toBeVisible();
    await expect(page.locator('button', { hasText: '60' }).filter({ hasText: 'minutes' })).toBeVisible();
    await expect(page.locator('button', { hasText: '120' }).filter({ hasText: 'minutes' })).toBeVisible();
  });
});
