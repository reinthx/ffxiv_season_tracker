import { test, expect } from '@playwright/test';
import { pinTestDate } from './helpers';

test('landing shows both trackers and ACTIVE moogle badge', async ({ page }) => {
  await pinTestDate(page);
  await page.goto('/');

  await expect(page.locator('a[href="/series/"]')).toBeVisible();
  await expect(page.locator('#moogle-card')).toBeVisible();

  const badge = page.locator('#moogle-card-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toContainText('ACTIVE');

  // Build check valve: footer shows which commit this bundle came from
  await expect(page.locator('#site-version')).toContainText('build');
});
