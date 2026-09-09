import { test, expect } from '@playwright/test';
import { pinTestDate } from './helpers';

test.beforeEach(async ({ page }) => {
  await pinTestDate(page);
  await page.goto('/moogle/');
  await expect(page.locator('#banner-event-name')).toHaveText('The First Hunt for Astronomy');
});

test('moogle tracker shows active Astronomy event with full shop', async ({ page }) => {
  await expect(page.locator('#banner-tome-type')).toHaveText('Irregular Tomestone of Astronomy I');
  await expect(page.locator('#shop-grid .shop-row')).toHaveCount(30);
  await expect(page.locator('#shop-grid')).toContainText('Uolon Horn');
  // Token cost is surfaced on the headline item
  await expect(page.locator('#shop-grid .shop-row', { hasText: 'Uolon Horn' })).toContainText('10🎟');
});

test('mogpendium lists minimog weeks and ultimog with token pills', async ({ page }) => {
  await page.evaluate(() => (window as any).switchTab('challenges'));
  await expect(page.locator('#challenges-ultimog')).toContainText('Aloalo Island');
  await expect(page.locator('#challenges-minimog')).toContainText('Bozja');
  await expect(page.locator('#tab-challenges-content')).toContainText('🎟');
});

test('token status tracks wished Uolon Horn (0/10, still earnable)', async ({ page }) => {
  // Seed a fresh wishlist pre-load via localStorage, then reload.
  await page.evaluate(() =>
    localStorage.setItem(
      'moogle-wishlist:moogle-2026-astronomy-1',
      JSON.stringify({ uolon_horn: { state: 'wished', qty: 1, qtyPurchased: 0 } }),
    ),
  );
  await page.reload();
  await expect(page.locator('#banner-event-name')).toHaveText('The First Hunt for Astronomy');
  const status = page.locator('#w-token-status');
  await expect(status).toBeVisible();
  await expect(status).toContainText('0/10');
  await expect(status).toContainText('still earnable');
});

test('Collect lookup without an ID does no network and returns null', async ({ page }) => {
  // The list API ignores search=, so name lookups silently returned wrong
  // items. fetchCollectItem must only resolve by numeric collectId.
  const result = await page.evaluate(async () => {
    (window as any).fetch = () => {
      throw new Error('fetchCollectItem must not hit the network without a collectId');
    };
    return await (window as any).fetchCollectItem('mount', 'Uolon');
  });
  expect(result).toBeNull();
});

test('marking Uolon Horn bought with no tokens warns', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem(
      'moogle-wishlist:moogle-2026-astronomy-1',
      JSON.stringify({ uolon_horn: { state: 'wished', qty: 1, qtyPurchased: 0 } }),
    );
  });
  await page.reload();
  await expect(page.locator('#banner-event-name')).toHaveText('The First Hunt for Astronomy');
  await page.evaluate(() => (window as any).markPurchased('uolon_horn'));
  await expect(page.locator('#toast')).toContainText('tokens earned');
});
