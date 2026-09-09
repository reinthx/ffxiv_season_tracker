import { test, expect } from '@playwright/test';
import { gotoSeries } from './helpers';

test('series tracker loads current Series 12 with 25 rewards', async ({ page }) => {
  await gotoSeries(page);

  await expect(page.locator('#banner-patch')).toHaveText('Patch 7.56');
  await expect(page.locator('#rewards-title')).toHaveText('Series 12 Rewards');

  const cards = page.locator('#rewards-grid .reward-card');
  await expect(cards).toHaveCount(25);
  await expect(page.locator('#rewards-grid .reward-card.is-special')).toHaveCount(5);

  // Milestone names from the new season
  await expect(page.locator('#rewards-grid')).toContainText('Half-rim Spectacles');
  await expect(page.locator('#rewards-grid')).toContainText('Little Red Viking');
  await expect(page.locator('#rewards-grid')).toContainText('Rocket Punch');

  // Milestone images resolve (no missing icon files)
  for (const name of ['Little Red Viking', 'Rocket Punch Identification Key']) {
    const img = page.locator('#rewards-grid .reward-card', { hasText: name }).locator('img');
    const src = await img.getAttribute('src');
    expect(src).toBeTruthy();
    const resp = await page.request.get(new URL(src!, page.url()).pathname);
    expect(resp.status()).toBe(200);
  }
});

test('past series tab lists Series 11', async ({ page }) => {
  await gotoSeries(page);
  await page.evaluate(() => (window as any).switchTab('data'));
  await expect(page.locator('#data-series-list')).toContainText('Series 11');
});
