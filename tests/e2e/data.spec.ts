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

test('version.json identifies the built commit', async ({ request }) => {
  // scripts/build.js stamps this (gitignored). Run a build first if missing.
  const resp = await request.get('/data/version.json');
  expect(resp.ok()).toBeTruthy();
  const v = await resp.json();
  expect(v.commit).toMatch(/^[0-9a-f]{40}$/);
  expect(v.short).toBe(v.commit.slice(0, 7));
  expect(Number.isNaN(new Date(v.builtAt).getTime())).toBe(false);
});

const COLLECTABLE = new Set(['mount', 'minion', 'emote', 'hairstyle', 'barding', 'orchestrion', 'triad']);

test('all moogle events have unique duty ids', async ({ request }) => {
  const data = await (await request.get('/data/moogle_events.json')).json();
  for (const ev of data.events) {
    const ids = (ev.duties || []).map((d: any) => d.id);
    expect(new Set(ids).size, `${ev.key} duplicate duty ids`).toBe(ids.length);
  }
});

test('Mogpendium-era events have collectIds on all Collect-tracked items', async ({ request }) => {
  // Collect integration only resolves by numeric ID (the list API ignores
  // search=), so every unique mount/minion/emote/hairstyle/barding/
  // orchestrion/triad item in a current-schema event must carry one.
  const data = await (await request.get('/data/moogle_events.json')).json();
  for (const ev of data.events) {
    if (!ev.weeks) continue; // pre-Mogpendium seed data exempt
    const missing = (ev.shop || [])
      .filter((i: any) => i.unique && COLLECTABLE.has(i.category) && typeof i.collectId !== 'number')
      .map((i: any) => i.id);
    expect(missing, `${ev.key} items without collectId`).toEqual([]);
  }
});
