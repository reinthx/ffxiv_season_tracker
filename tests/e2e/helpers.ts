import { test, expect, Page } from '@playwright/test';

/** Pin "today" to 2026-09-20 PDT (mid First Hunt for Astronomy, Series 12 live). */
export async function pinTestDate(page: Page) {
  const fixed = new Date('2026-09-20T12:00:00-07:00').getTime();
  await page.addInitScript((now: number) => {
    const RealDate = Date;
    const fixedDate = new RealDate(now);
    // @ts-ignore — test-only Date stub
    window.Date = class extends RealDate {
      constructor(...args: unknown[]) {
        // @ts-ignore
        super(...(args.length ? args : [fixedDate.getTime()]));
      }
      static now() {
        return fixedDate.getTime();
      }
    };
  }, fixed);
}

export async function gotoSeries(page: Page) {
  await pinTestDate(page);
  await page.goto('/series/');
  await expect(page.locator('#banner-series-name')).toHaveText('Series 12');
}
