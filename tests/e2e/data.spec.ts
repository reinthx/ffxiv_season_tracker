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

test('artifacts.json has live expansions with valid steps, items and achievement maps', async ({ request }) => {
  const data = await (await request.get('/data/artifacts.json')).json();
  expect(data.expansions.length).toBeGreaterThan(0);

  // Expansion order is chronological and keys are unique
  const keys = data.expansions.map((e: any) => e.key);
  expect(new Set(keys).size).toBe(keys.length);
  expect(keys).toEqual(['arr-zodiac', 'hw-anima', 'sb-eureka', 'shadowbringers-resistance', 'ew-manderville', 'dt-phantom']);

  for (const exp of data.expansions) {
    expect(exp.name, `${exp.key} name`).toBeTruthy();
    expect(exp.accent, `${exp.key} accent`).toMatch(/^#[0-9a-f]{6}$/i);
    const itemKeys = new Set<string>();
    for (const st of exp.steps || []) {
      expect(st.quest, `${exp.key} quest name`).toBeTruthy();
      expect(st.perWeapon, `${exp.key}/${st.quest} perWeapon`).toBeGreaterThan(0);
      if (st.kind === 'onetime') {
        expect(typeof st.n, `${exp.key} onetime key`).toBe('string');
        expect((st.items || []).length, `${exp.key}/${st.quest} items`).toBeGreaterThan(0);
        for (const it of st.items) {
          expect(it.key, 'onetime item key').toBeTruthy();
          expect(itemKeys.has(it.key), `duplicate item key ${it.key}`).toBe(false);
          itemKeys.add(it.key);
          expect(it.perWeapon, `${it.key} perWeapon`).toBeGreaterThan(0);
          expect((it.sources || []).length, `${it.key} sources`).toBeGreaterThan(0);
          for (const s of it.sources) expect(s.yields, `${it.key} yield`).toBeGreaterThan(0);
        }
      } else {
        expect(typeof st.n, `${exp.key} step number`).toBe('number');
        expect(st.itemKey, `${exp.key}/${st.quest} itemKey`).toBeTruthy();
        expect(itemKeys.has(st.itemKey), `duplicate item key ${st.itemKey}`).toBe(false);
        itemKeys.add(st.itemKey);
        expect((st.sources || []).length, `${exp.key}/${st.quest} sources`).toBeGreaterThan(0);
      }
      // Achievement maps reference known jobs with numeric Collect IDs
      if (st.collectAchievementIds) {
        for (const [job, id] of Object.entries(st.collectAchievementIds)) {
          expect(exp.jobs, `${exp.key} achievement job ${job}`).toContain(job);
          expect(typeof id, `${exp.key}/${job} achievement id`).toBe('number');
        }
      }
      // Requirements are strings or {t, link} objects
      for (const r of st.requirements || []) {
        if (typeof r === 'string') continue;
        expect(r.t, 'requirement text').toBeTruthy();
        if (r.link) expect(r.link.startsWith('https://'), 'requirement link').toBe(true);
      }
    }
    // Weapon stage tables cover every job with one stage per repeatable step
    const repCount = (exp.steps || []).filter((s: any) => s.kind !== 'onetime' && typeof s.n === 'number').length;
    for (const w of exp.weapons || []) {
      expect(exp.jobs, `${exp.key} weapon job ${w.job}`).toContain(w.job);
      expect(w.stages, `${w.job} stages`).toHaveLength(repCount);
    }
  }

  const shb = data.expansions.find((e: any) => e.key === 'shadowbringers-resistance');
  expect(shb.status).toBe('live');
  expect(shb.jobs).toHaveLength(17);
  // One-time chain order matches the quest path
  expect(shb.steps.map((s: any) => s.n)).toEqual([1, 2, 3, 4, 'ot1', 5, 'ot2a', 'ot2b', 'ot2c', 6]);
  // Parallel Zadnor trio unlocks as a unit
  expect(shb.steps.filter((s: any) => s.parallel === 'ot2').map((s: any) => s.n)).toEqual(['ot2a', 'ot2b', 'ot2c']);
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
