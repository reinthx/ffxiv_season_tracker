import { test, expect } from '@playwright/test';

test('series.json has Series 12 current with 25 rewards / 5 milestones', async ({ request }) => {
  const resp = await request.get('/data/series.json');
  expect(resp.ok()).toBeTruthy();
  const data = await resp.json();

  expect(data.currentSeries).toBe(12);
  const cur = data.events ?? data.series;
  const current = cur.find((s: any) => s.current);
  expect(current.num).toBe(12);
  expect(current.patch).toBe('7.56');
  expect(current.rewards).toHaveLength(25);
  expect(current.rewards.filter((r: any) => r.milestone)).toHaveLength(5);

  const s11 = cur.find((s: any) => s.num === 11);
  expect(s11.current).toBe(false);
  expect(s11.patchEnd).toBe('2026-09-08');
});

test('moogle_events.json has active Astronomy event with valid shop/duties', async ({ request }) => {
  const resp = await request.get('/data/moogle_events.json');
  expect(resp.ok()).toBeTruthy();
  const data = await resp.json();

  const active = data.events.filter((e: any) => e.active);
  expect(active).toHaveLength(1);
  const ev = active[0];
  expect(ev.key).toBe('moogle-2026-astronomy-1');
  expect(ev.shop).toHaveLength(30);
  expect(ev.weeks).toHaveLength(6);

  const dutyIds = new Set(ev.duties.map((d: any) => d.id));
  expect(dutyIds.size).toBe(ev.duties.length); // no duplicate duty ids
  for (const item of ev.shop) {
    expect(item.id).toBeTruthy();
    expect(item.name).toBeTruthy();
    expect(typeof item.cost).toBe('number');
    expect(item.category).toBeTruthy();
  }

  const uolon = ev.shop.find((i: any) => i.id === 'uolon_horn');
  expect(uolon.tokenCost).toBe(10);
  expect(uolon.collectId).toBe(414);
});
