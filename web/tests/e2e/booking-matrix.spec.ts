import { test, expect } from '@playwright/test';

test.describe('Booking Matrix: All Courts, Prices/Durations, and Times', () => {

  const setupKioskMocks = async (page: any, memberBalance: number = 2000) => {
    // Mock the RFID member lookup
    await page.route('**/api/terminal/member/**', async (route: any) => {
      await route.fulfill({
        json: {
          id: 'mock-member-123',
          memberId: 'M123',
          firstName: 'Alex',
          lastName: 'Rivera',
          balance: memberBalance,
          token: 'mock-token'
        }
      });
    });

    // Mock queue GET/POST
    await page.route('**/api/queue**', async (route: any) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: [] });
      } else {
        await route.fulfill({ json: { success: true, id: 'test-queue-matrix' } });
      }
    });

    // Mock courts status
    await page.route('**/api/courts/status', async (route: any) => {
      await route.fulfill({
        json: {
          'court-1': { status: 'available' },
          'court-2': { status: 'available' },
        }
      });
    });

    // Mock pricing config
    await page.route('**/api/public/prices', async (route: any) => {
      await route.fulfill({
        json: {
          durations: [{ minutes: 30, price: 150 }, { minutes: 60, price: 300 }, { minutes: 90, price: 450 }],
          gameTypes: [
            { id: 'singles', name: 'Singles', multiplier: 1 },
            { id: 'doubles', name: 'Doubles', multiplier: 0.5 }
          ]
        }
      });
    });

    // Mock health
    await page.route('**/api/health', async (route: any) => {
      await route.fulfill({ json: { ok: true } });
    });

    // Mock settings endpoint (rates: 30=150, 60=300, 90=450)
    await page.route('**/rest/v1/settings?*', async (route: any) => {
      await route.fulfill({
        json: [
          { key: 'products', value: JSON.stringify({ matchTypes: ['1v1', '2v2'], durations: [30, 60, 90] }) },
          { key: 'prices', value: JSON.stringify({ '30': 150, '60': 300, '90': 450 }) },
        ]
      });
    });

    // Mock bookings submission
    await page.route('**/api/bookings**', async (route: any) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        await route.fulfill({
          json: {
            id: 'mock-booking-' + Date.now(),
            status: 'scheduled',
            courtId: body.courtId,
            start: body.start,
            duration: body.duration,
            partySize: body.partySize,
          }
        });
      } else {
        await route.fulfill({ json: [] });
      }
    });
    // Helper to navigate and ensure idle is ready
    const goToIdle = async () => {
      await page.goto('/booking?testmode=true');
      await expect(page.locator('text=Test RFID Input')).toBeVisible();
    };

    return { goToIdle };
  };

  test.describe('Court Selection: Booking Court 1, Court 2, and Any Court', () => {
    const courtsToTest = [
      { name: 'Court 1', expectedName: 'Court 1' },
      { name: 'Court 2', expectedName: 'Court 2' },
      { name: 'Any Court', expectedName: 'Any Court' }
    ];

    for (const { name, expectedName } of courtsToTest) {
      test(`successfully books specifically on ${name}`, async ({ page }) => {
        const { goToIdle } = await setupKioskMocks(page);
        await goToIdle();

        // Scan RFID
        await page.locator('input[placeholder="Enter Card UID"]').fill('TEST001');
        await page.locator('button:has-text("Go")').click();

        // Select Schedule mode
        await expect(page.locator('text=Welcome, Alex')).toBeVisible();
        await page.locator('button:has-text("Schedule")').click();

        // Select Date & Time (morning 09:00)
        await expect(page.locator('text=Select Date & Time')).toBeVisible();
        const dateInput = page.locator('input[type="date"]');
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 3);
        const dateString = futureDate.toISOString().split('T')[0];
        await dateInput.fill(dateString);
        await page.locator('select').selectOption('09:00');
        await page.locator('button:has-text("Continue")').click();

        // Select Court
        await expect(page.locator('text=Where do you want to play?')).toBeVisible();
        await page.locator('button').filter({ hasText: name }).first().click();

        // Select Game Format
        await expect(page.locator('text=How do you want to play?')).toBeVisible();
        await page.locator('button:has-text("Singles")').click();

        // Select Duration
        await expect(page.locator('text=How long would you like to play?')).toBeVisible();
        await page.locator('button:has-text("60")').click();

        // Confirm Screen checks
        await expect(page.locator('text=Review Booking Details')).toBeVisible();
        await expect(page.locator(`text=${expectedName}`).first()).toBeVisible();

        // Confirm
        await page.locator('button:has-text("Confirm & Book Match")').click();
        await expect(page.locator('text=Booking Scheduled')).toBeVisible();
      });
    }
  });

  test.describe('Pricing & Durations: 30m, 60m, 90m for Singles vs Doubles', () => {
    // Pricing formula: Math.round((rate * (duration / 30)) / (partySize === 4 ? 2 : 1))
    // Rates: 30=150, 60=300, 90=450
    // 30m:  150 * 1 = 150 (Singles), 150 / 2 = 75 (Doubles)
    // 60m:  300 * 2 = 600 (Singles), 600 / 2 = 300 (Doubles)
    // 90m:  450 * 3 = 1350 (Singles), 1350 / 2 = 675 (Doubles)

    const pricingScenarios = [
      { duration: '30', gameFormat: 'Singles', cost: 150 },
      { duration: '30', gameFormat: 'Doubles', cost: 75 },
      { duration: '60', gameFormat: 'Singles', cost: 600 },
      { duration: '60', gameFormat: 'Doubles', cost: 300 },
      { duration: '90', gameFormat: 'Singles', cost: 1350 },
      { duration: '90', gameFormat: 'Doubles', cost: 675 },
    ];

    for (const { duration, gameFormat, cost } of pricingScenarios) {
      test(`correctly prices ${duration} mins ${gameFormat} match at ₱${cost}`, async ({ page }) => {
        const initialBalance = 2000;
        await setupKioskMocks(page, initialBalance);

        await page.goto('/booking?testmode=true');
        await page.locator('input[placeholder="Enter Card UID"]').fill('TEST001');
        await page.locator('button:has-text("Go")').click();

        await page.locator('button:has-text("Schedule")').click();

        // Select Date & Time
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 2);
        await page.locator('input[type="date"]').fill(futureDate.toISOString().split('T')[0]);
        await page.locator('select').selectOption('10:00');
        await page.locator('button:has-text("Continue")').click();

        // Pick Any Court
        await page.locator('button').filter({ hasText: 'Any Court' }).first().click();

        // Select Game format
        await page.locator(`button:has-text("${gameFormat}")`).click();

        // Select Duration
        await page.locator(`button:has-text("${duration}")`).click();

        // Review Details Verification
        await expect(page.locator('text=Review Booking Details')).toBeVisible();
        await expect(page.locator(`text=−₱${cost.toLocaleString()}`)).toBeVisible();
        
        const expectedRemaining = initialBalance - cost;
        await expect(page.locator(`text=₱${expectedRemaining.toLocaleString()}`)).toBeVisible();
      });
    }

    test('prevents booking when wallet balance is insufficient for selected price', async ({ page }) => {
      // Set member balance lower than 90m singles cost (₱1350)
      const lowBalance = 400;
      await setupKioskMocks(page, lowBalance);

      await page.goto('/booking?testmode=true');
      await page.locator('input[placeholder="Enter Card UID"]').fill('TEST001');
      await page.locator('button:has-text("Go")').click();

      await page.locator('button:has-text("Schedule")').click();

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 2);
      await page.locator('input[type="date"]').fill(futureDate.toISOString().split('T')[0]);
      await page.locator('select').selectOption('11:00');
      await page.locator('button:has-text("Continue")').click();

      await page.locator('button').filter({ hasText: 'Any Court' }).first().click();
      await page.locator('button:has-text("Singles")').click();
      // 90 mins singles costs ₱1350, but user only has ₱400
      await page.locator('button:has-text("90")').click();

      // Should display Insufficient Credits and disable the confirm button
      await expect(page.locator('text=Insufficient Credits')).toBeVisible();
      const confirmButton = page.locator('button:has-text("Confirm & Book Match")');
      await expect(confirmButton).toBeDisabled();
    });
  });

  test.describe('Time Slots: Morning, Afternoon, Evening', () => {
    const timesToTest = [
      { time: '08:00', label: 'Morning slot' },
      { time: '14:00', label: 'Afternoon slot' },
      { time: '20:00', label: 'Evening slot' },
    ];

    for (const { time, label } of timesToTest) {
      test(`correctly schedules booking for ${label} (${time})`, async ({ page }) => {
        await setupKioskMocks(page);

        await page.goto('/booking?testmode=true');
        await page.locator('input[placeholder="Enter Card UID"]').fill('TEST001');
        await page.locator('button:has-text("Go")').click();

        await page.locator('button:has-text("Schedule")').click();

        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 4);
        const dateStr = futureDate.toISOString().split('T')[0];
        await page.locator('input[type="date"]').fill(dateStr);
        await page.locator('select').selectOption(time);
        await page.locator('button:has-text("Continue")').click();

        await page.locator('button').filter({ hasText: 'Any Court' }).first().click();
        await page.locator('button:has-text("Singles")').click();
        await page.locator('button:has-text("60")').click();

        // Review screen confirms the time
        await expect(page.locator('text=Review Booking Details')).toBeVisible();
        await page.locator('button:has-text("Confirm & Book Match")').click();

        await expect(page.locator('text=Booking Scheduled')).toBeVisible();
      });
    }
  });

  test.describe('Web Booking Portal (/book): Court, Duration, and Price Calculation', () => {
    test('updates estimated price when switching duration and format', async ({ page }) => {
      await page.goto('/book');

      // Check duration select updates price
      const durationSelect = page.locator('select').first();
      const formatSelect = page.locator('select').nth(1);

      // Duration 30 mins
      await durationSelect.selectOption('30');
      await expect(page.locator('text=/Estimated cost: ₱/')).toBeVisible();

      // Duration 60 mins
      await durationSelect.selectOption('60');
      await expect(page.locator('text=/Estimated cost: ₱/')).toBeVisible();

      // Duration 90 mins
      await durationSelect.selectOption('90');
      await expect(page.locator('text=/Estimated cost: ₱/')).toBeVisible();

      // Switch to Doubles
      await formatSelect.selectOption('2v2');
      await expect(page.locator('text=/Estimated cost: ₱/')).toBeVisible();
    });

    test('fetches availability slots for different courts and dates via API', async ({ page }) => {
      const today = new Date().toISOString().split('T')[0];
      
      const resCourt1 = await page.request.get(`/api/bookings/availability?courtId=court-1&date=${today}&duration=60`);
      expect(resCourt1.status()).toBe(200);
      const dataCourt1 = await resCourt1.json();
      expect(dataCourt1.slots).toBeDefined();
      expect(Array.isArray(dataCourt1.slots)).toBe(true);
      expect(dataCourt1.slots.length).toBeGreaterThan(0);
      // Verify slot structure: { time: '08:00', available: boolean }
      expect(dataCourt1.slots[0]).toHaveProperty('time');
      expect(dataCourt1.slots[0]).toHaveProperty('available');

      const resCourt2 = await page.request.get(`/api/bookings/availability?courtId=court-2&date=${today}&duration=30`);
      expect(resCourt2.status()).toBe(200);
      const dataCourt2 = await resCourt2.json();
      expect(dataCourt2.slots).toBeDefined();
      expect(Array.isArray(dataCourt2.slots)).toBe(true);
      expect(dataCourt2.slots.length).toBeGreaterThan(0);
    });
  });
});
