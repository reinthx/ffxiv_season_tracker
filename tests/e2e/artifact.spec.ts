import { test, expect, Page } from '@playwright/test';

// The guide re-renders synchronously on every toggle, which detaches elements
// mid-action — evaluate-click avoids Playwright's actionability races.
async function checkAllPrereqs(page: Page) {
  await page.locator('#art-prereq').first().waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
  for (let i = 0; i < 20; i++) {
    const boxes = page.locator('#art-prereq input[type=checkbox]:not(:checked)');
    if ((await boxes.count()) === 0) break;
    await boxes.first().evaluate(el => (el as HTMLInputElement).click());
  }
}

async function track(page: Page, job: string) {
  await page.locator('#art-job-chips-tab button', { hasText: job }).first().evaluate(el => (el as HTMLButtonElement).click());
}

async function markStep(page: Page, n: number | string) {
  await page.locator(`#art-step-${n} .art-mark-done`).first().evaluate(el => (el as HTMLElement).click());
}

async function markOnce(page: Page, n: number | string) {
  await page.locator(`#art-step-${n} .art-mark-done`).first().evaluate(el => (el as HTMLElement).click());
}

async function matrixBox(page: Page, n: number) {
  return page.locator('#art-tab-content table span[role="checkbox"]').nth(n);
}

test('hub landing renders and links into each expansion guide', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('401') && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto('/artifacts/');
  await expect(page.locator('#art-expansions')).toContainText('Resistance Weapons');
  await expect(page.locator('h1')).toContainText('Relic Hub');
  // Card navigates to the per-expansion one-page guide.
  await page.locator('#art-expansions > div', { hasText: 'Resistance Weapons' }).click();
  await expect(page).toHaveURL(/expansion(\.html)?\?exp=shadowbringers-resistance/);
  await expect(page.locator('#exp-title')).toContainText('Resistance Weapons');
  await expect(page.locator('#art-guide')).toContainText('Start here');
  expect(errors).toEqual([]);
});

test('expansion guide: unlock bubble -> step card -> mark done -> reference', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('artifact:shadowbringers-resistance', JSON.stringify({
      jobs: { AST: true }, have: {}, steps: {}, reqs: {},
    }));
  });
  await page.goto('/artifacts/expansion.html?exp=shadowbringers-resistance');

  // Gated: one unlock bubble, step 1 hidden.
  await expect(page.locator('#art-prereq')).toContainText('The City of Lost Angels');
  await expect(page.locator('#art-prereq')).toContainText('Hail to the Queen');
  await expect(page.locator('#art-step-1')).toHaveCount(0);

  await checkAllPrereqs(page);
  await expect(page.locator('#art-step-1')).toBeVisible();
  await expect(page.locator('#art-step-1')).toContainText('Resistance is Not Futile');
  await expect(page.locator('#art-step-1')).toContainText('GO HERE');
  await expect(page.locator('#art-step-1')).toHaveAttribute('data-status', 'open');
  // Single, non-class-based completion switch for the step
  await expect(page.locator('#art-step-1 .art-mark-done')).toBeVisible();

  // Full reference sheet aggregates every piece.
  await expect(page.locator('#art-sheet')).toContainText('Thavnairian Scalepowder');

  // Mark done -> it becomes a breadcrumb + repeat reference, step 2 unlocks.
  await markStep(page, 1);
  await expect(page.locator('#art-step-1')).toHaveAttribute('data-status', 'done');
  await expect(page.locator('#art-step-1')).toContainText('Repeat reference');
  await expect(page.locator('#art-prereq')).toContainText('A Resistance weapon from Fire in the Forge');

  // Sources modal from a step card
  await page.locator('#art-step-1 .art-stepactions button', { hasText: 'Sources' }).first().evaluate(el => (el as HTMLElement).click());
  await expect(page.locator('#item-modal-overlay.open')).toBeVisible();
  await expect(page.locator('#art-item-name')).toContainText('Thavnairian Scalepowder');
  await expect(page.locator('#art-item-body')).toContainText('Poetics vendor');
  expect(errors).toEqual([]);
});

test('progress overview matrix opens the per-class inventory', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('artifact:shadowbringers-resistance', JSON.stringify({
      jobs: { AST: true }, have: {}, steps: {}, reqs: {},
    }));
  });
  await page.goto('/artifacts/expansion.html?exp=shadowbringers-resistance');
  await checkAllPrereqs(page);
  await page.locator('#art-tab-content details.art-overview > summary').click();
  await page.locator('#art-tab-content table th button', { hasText: 'AST' }).first().evaluate(el => (el as HTMLElement).click());
  await expect(page.locator('#art-inv-title')).toContainText('AST Resistance Weapons Inventory');
  await expect(page.locator('#art-inv-body')).toContainText('Thavnairian Scalepowder');
  await expect(page.locator('#art-inv-body')).not.toContainText('Loathsome Memories');
  expect(errors).toEqual([]);
});

test('first weapon free: step-1 math charges one fewer weapon', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('artifact:shadowbringers-resistance', JSON.stringify({
      jobs: { AST: true, MNK: true }, have: {}, steps: {}, reqs: {},
    }));
  });
  await page.goto('/artifacts/expansion.html?exp=shadowbringers-resistance');
  await checkAllPrereqs(page);
  await expect(page.locator('#art-step-1')).toContainText('first free');
  const need = await page.evaluate(() => {
    const g = (window as unknown as { ARTIFACTS: { steps: unknown[] }[] }).ARTIFACTS
      .find((e: unknown) => (e as { key: string }).key === 'shadowbringers-resistance')!;
    const st = (g.steps as { n: number }[]).find(s => s.n === 1);
    return (window as unknown as { artGrindForStep: (e: unknown, s: unknown) => { need: number } })
      .artGrindForStep(g, st).need;
  });
  expect(need).toBe(4);
  expect(errors).toEqual([]);
});

test('character switcher lists cloud saves and switches', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('/api/me', r => r.fulfill({ json: { id: 7, discordId: '7', username: 'Tester', avatar: null } }));
  await page.route('/api/characters', r => r.fulfill({ json: [{
    lodestoneId: '424242', characterName: 'Test Char', characterWorld: 'Balmung',
    avatarUrl: null, portraitUrl: null, lodestoneTitle: null, lodestoneFC: null,
    lodestoneClass: 'Astrologian', lodestoneClassLevel: 100,
  }] }));
  await page.route('/api/artifacts/*', r => r.fulfill({ status: 404 }));
  await page.goto('/artifacts/');
  await expect(page.locator('#art-onboard')).toContainText('Start here');
  await page.locator('#art-onboard button', { hasText: 'Pick an expansion' }).click();
  await expect(page.locator('#art-char-switcher')).toContainText('Test Char');
  await page.locator('#art-char-switcher button', { hasText: 'Test Char' }).click();
  await expect(page.locator('#art-char-display')).toContainText('Test Char');
  expect(errors).toEqual([]);
});

test('share link roundtrips into a read-only view', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    localStorage.setItem('artifact:shadowbringers-resistance', JSON.stringify({
      jobs: { AST: true }, have: { thav_scalepowder: 2 }, steps: { 'AST:1': 'done' }, reqs: {},
    }));
    localStorage.setItem('artifact-character', JSON.stringify({
      name: 'Sharer Name', world: 'Balmung', lodestoneId: '424242', avatarUrl: null,
    }));
  });
  await page.goto('/artifacts/expansion.html?exp=shadowbringers-resistance');
  // Share button was removed in favor of the Expansion Card; the share-link
  // decoder stays for backwards compat, so invoke the builder directly.
  await page.evaluate(() => (window as any).artShareURL());
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toContain('#art=shadowbringers-resistance');
  expect(url).toContain('sh=1');

  // Fresh visitor opens the link: banner shows, state matches, edits blocked
  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  await expect(page.locator('#art-share-banner')).toBeVisible();
  await expect(page.locator('#art-share-banner')).toContainText('Sharer Name');
  await expect(page.locator('#art-step-1')).toHaveAttribute('data-status', 'done');
  await expect(page.locator('#art-share-banner button')).toContainText('Back to your grind');
  expect(errors.filter(e => !/4(01|04)/.test(e))).toEqual([]);
});

test('expansion card preview opens for the active expansion', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('artifact-character', JSON.stringify({
      name: 'Card Tester', world: 'Balmung', lodestoneId: '424242', avatarUrl: null,
    }));
    localStorage.setItem('artifact:shadowbringers-resistance', JSON.stringify({
      jobs: { AST: true, MNK: true }, have: {}, steps: { 'AST:1': 'done', 'MNK:1': 'done' }, reqs: {},
    }));
  });
  await page.goto('/artifacts/expansion.html?exp=shadowbringers-resistance');
  await page.locator('#art-tab-content button', { hasText: 'Create Expansion Card' }).evaluate(el => (el as HTMLElement).click());
  await expect(page.locator('#art-expansion-card-overlay')).toBeVisible();
  await expect(page.locator('#art-expansion-card-img')).toHaveAttribute('src', /blob:/);
  await expect(page.locator('#art-expansion-card-overlay')).toContainText('Download PNG');
  expect(errors).toEqual([]);
});

test('manual completion cascades to earlier steps', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('artifact:shadowbringers-resistance', JSON.stringify({
      jobs: { BRD: true }, have: {}, steps: {}, reqs: {},
    }));
    localStorage.setItem('artifact-showall:shadowbringers-resistance', '1');
  });
  await page.goto('/artifacts/expansion.html?exp=shadowbringers-resistance');
  const checked = () => page.locator('#art-tab-content table span[role="checkbox"][aria-checked="true"]');
  await expect(checked()).toHaveCount(0);
  // Mark step 3 directly — steps 1 and 2 fill in as implied
  await (await matrixBox(page, 2)).evaluate(el => (el as HTMLElement).click());
  await expect(checked()).toHaveCount(3);
  await expect(page.locator('#art-step-1')).toHaveAttribute('data-status', 'done');
  await expect(page.locator('#art-step-3')).toHaveAttribute('data-status', 'done');
  expect(errors).toEqual([]);
});

test('one-time grinds start collapsed and expand on demand', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('artifact:shadowbringers-resistance', JSON.stringify({
      jobs: { AST: true }, have: {}, steps: {}, reqs: {},
    }));
    localStorage.setItem('artifact-showall:shadowbringers-resistance', '1');
  });
  await page.goto('/artifacts/expansion.html?exp=shadowbringers-resistance');
  await checkAllPrereqs(page);

  const section = page.locator('#art-tab-content details.art-onetime');
  await expect(section).toHaveCount(1);
  await expect(section).not.toHaveAttribute('open', /./);
  await expect(section.locator('summary').first()).toContainText('One-time grinds');

  await section.locator('summary').first().evaluate((el: HTMLElement) => el.click());
  await expect(section).toHaveAttribute('open', '');
  await expect(section).toContainText('A New Path of Resistance');
  expect(errors).toEqual([]);
});

test('FFXIV Collect check auto-marks owned relic steps', async ({ page }) => {
  // Real verified achievement IDs: 2574 = MNK base, 2867 = DNC Blade's.
  await page.route('https://ffxivcollect.com/api/characters/*', r => r.fulfill({ json: {
    last_parsed: new Date().toISOString(),
    achievements: { ids: [2574, 2867] },
    mounts: { ids: [] },
    minions: { ids: [] },
  } }));
  let collectCalls = 0;
  page.on('request', r => { if (r.url().includes('ffxivcollect.com/api/characters')) collectCalls++; });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('artifact-character', JSON.stringify({
      name: 'Collector', world: 'Gilgamesh', lodestoneId: '25015431', avatarUrl: null,
    }));
    localStorage.setItem('artifact:shadowbringers-resistance', JSON.stringify({
      jobs: { MNK: true, DNC: true }, have: {}, steps: { 'DNC:4': 'ignored' }, reqs: {},
    }));
    localStorage.setItem('artifact-showall:shadowbringers-resistance', '1');
  });
  await page.goto('/artifacts/expansion.html?exp=shadowbringers-resistance');
  const boxes = () => page.locator('#art-tab-content table span[role="checkbox"]');
  const checked = () => page.locator('#art-tab-content table span[role="checkbox"][aria-checked="true"]');
  await expect(boxes()).toHaveCount(12);
  await expect(checked()).toHaveCount(0);
  await page.locator('#art-char-display button', { hasText: 'Check owned' }).evaluate(el => (el as HTMLElement).click());
  // Owning a stage implies every earlier one (cascade): MNK step 1, plus
  // DNC steps 1,2,3,5,6 — but DNC step 4 stays ignored, never overwritten.
  await expect(checked()).toHaveCount(6);
  await expect(boxes().nth(0)).toHaveAttribute('aria-checked', 'true'); // step 1 MNK
  await expect(boxes().nth(1)).toHaveAttribute('aria-checked', 'true'); // step 1 DNC (implied)
  await expect(boxes().nth(7)).toHaveAttribute('aria-checked', 'false'); // step 4 DNC (ignored kept)
  await expect(boxes().nth(10)).toHaveAttribute('aria-checked', 'false'); // step 6 MNK
  await expect(boxes().nth(11)).toHaveAttribute('aria-checked', 'true'); // step 6 DNC
  // Second click serves the 60s cache — no second network request, same result
  await page.locator('#art-char-display button', { hasText: 'Check owned' }).evaluate(el => (el as HTMLElement).click());
  expect(collectCalls).toBe(1);
  await expect(checked()).toHaveCount(6);
  expect(errors).toEqual([]);
});

test('Check owned with nothing tracked auto-tracks detected jobs', async ({ page }) => {
  await page.route('https://ffxivcollect.com/api/characters/*', r => r.fulfill({ json: {
    last_parsed: new Date().toISOString(),
    achievements: { ids: [2574] },
    mounts: { ids: [] },
    minions: { ids: [] },
  } }));
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('artifact-character', JSON.stringify({
      name: 'Collector', world: 'Gilgamesh', lodestoneId: '25015431', avatarUrl: null,
    }));
    localStorage.setItem('artifact:shadowbringers-resistance', JSON.stringify({
      jobs: {}, have: {}, steps: {}, reqs: {},
    }));
    localStorage.setItem('artifact-showall:shadowbringers-resistance', '1');
  });
  await page.goto('/artifacts/expansion.html?exp=shadowbringers-resistance');
  await expect(page.locator('#art-start')).toBeVisible();
  await page.locator('#art-char-display button', { hasText: 'Check owned' }).evaluate(el => (el as HTMLElement).click());
  await expect(page.locator('#art-tab-content table span[role="checkbox"][aria-checked="true"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('incoherent saves heal on load: later done implies earlier', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('artifact:shadowbringers-resistance', JSON.stringify({
      jobs: { DNC: true }, have: {},
      steps: {
        'DNC:6': 'done',
        '*:ot1': 'done', '*:ot2a': 'done', '*:ot2b': 'done', '*:ot2c': 'done',
      },
      reqs: {},
    }));
  });
  await page.goto('/artifacts/expansion.html?exp=shadowbringers-resistance');
  const checked = () => page.locator('#art-tab-content table span[role="checkbox"][aria-checked="true"]');
  await expect(checked()).toHaveCount(6);
  await expect(page.locator('#art-prereq')).toHaveCount(0);
  await expect(page.locator('#art-guide')).toBeEmpty();
  await expect(page.locator('#art-completed-guide')).toContainText('Completed quests');
  await expect(page.locator('#art-sheet button', { hasText: 'Review Completed Quests' })).toBeVisible();
  // The review button opens the folded guide at the bottom of the page.
  await page.locator('#art-sheet button', { hasText: 'Review Completed Quests' }).click();
  await expect(page.locator('#art-completed-guide .art-stepcard').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('linking a character auto-runs the Collect check once', async ({ page }) => {
  await page.route('https://ffxivcollect.com/api/characters/*', r => r.fulfill({ json: {
    last_parsed: new Date().toISOString(),
    achievements: { ids: [2574] },
    mounts: { ids: [] },
    minions: { ids: [] },
  } }));
  let collectCalls = 0;
  page.on('request', r => { if (r.url().includes('ffxivcollect.com/api/characters')) collectCalls++; });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/artifacts/expansion.html?exp=shadowbringers-resistance');
  await expect(page.locator('#exp-title')).toContainText('Resistance Weapons');
  await page.evaluate(() => {
    (window as unknown as { artUseCharacter: (...a: string[]) => void })
      .artUseCharacter('Collector', 'Gilgamesh', '25015431', '');
  });
  await expect(page.locator('#art-tab-content table span[role="checkbox"][aria-checked="true"]')).toHaveCount(1);
  expect(collectCalls).toBe(1);
  expect(errors).toEqual([]);
});

test('guide Completed toggle clears the step for every tracked class', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('artifact:shadowbringers-resistance', JSON.stringify({
      jobs: { AST: true, MNK: true }, have: {}, steps: {}, reqs: {},
    }));
    localStorage.setItem('artifact-showall:shadowbringers-resistance', '1');
  });
  await page.goto('/artifacts/expansion.html?exp=shadowbringers-resistance');
  await checkAllPrereqs(page);
  // Steps aren't class-based: one switch clears it for both classes at once.
  await expect(page.locator('#art-step-1 .art-mark-done')).toContainText('Mark as completed');
  await markStep(page, 1);
  await expect(page.locator('#art-step-1 .art-mark-done')).toContainText('Completed');
  await expect(page.locator('#art-tab-content table span[role="checkbox"][aria-checked="true"]')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('grind sheet lists which classes sit on each step', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('artifact:shadowbringers-resistance', JSON.stringify({
      jobs: { AST: true, MNK: true }, have: {}, steps: {}, reqs: {},
    }));
    localStorage.setItem('artifact-showall:shadowbringers-resistance', '1');
  });
  await page.goto('/artifacts/expansion.html?exp=shadowbringers-resistance');
  await expect(page.locator('#art-sheet')).toContainText('Classes');
  const clsCell = page.locator('#art-sheet tr', { hasText: 'Resistance is Not Futile' }).first();
  await expect(clsCell).toContainText('AST');
  await expect(clsCell).toContainText('MNK');
  expect(errors).toEqual([]);
});

test('split-farm stockpile can be lowered (no sticky aggregate)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('artifact:shadowbringers-resistance', JSON.stringify({
      jobs: { AST: true }, have: { tortured: 60, sorrowful: 60, harrowing: 60 },
      steps: { 'AST:1': 'done' },
      reqs: {
        'A Resistance weapon from Fire in the Forge': true,
        'MSQ Vows of Virtue, Deeds of Cruelty': true,
        'Side quests: Where Eagles Nest + A Sober Proposal': true,
      },
    }));
  });
  await page.goto('/artifacts/expansion.html?exp=shadowbringers-resistance');
  const have = () => page.evaluate(() => {
    const exp = (window as unknown as { ARTIFACTS: { key: string; steps: unknown[] }[] }).ARTIFACTS
      .find(e => e.key === 'shadowbringers-resistance')!;
    const st = (exp.steps as { n: number }[]).find(s => s.n === 2);
    return (window as unknown as { artGrindForStep: (e: unknown, s: unknown) => { have: number } })
      .artGrindForStep(exp, st).have;
  });
  expect(await have()).toBe(180);
  await page.evaluate(() => {
    (window as unknown as { artExpSetHave: (e: string, k: string, v: number) => void })
      .artExpSetHave('shadowbringers-resistance', 'tortured', 0);
  });
  await expect.poll(have).toBe(120);
  await page.evaluate(() => {
    (window as unknown as { artExpSetHave: (e: string, k: string, v: number) => void })
      .artExpSetHave('shadowbringers-resistance', 'sorrowful', 0);
  });
  await expect.poll(have).toBe(60);
  expect(errors).toEqual([]);
});

test('a finished class keeps the guide folded when a new class is added', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('artifact:shadowbringers-resistance', JSON.stringify({
      jobs: { AST: true, MNK: true }, have: {},
      steps: {
        'AST:1': 'done', 'AST:2': 'done', 'AST:3': 'done', 'AST:4': 'done',
        'AST:5': 'done', 'AST:6': 'done',
        '*:ot1': 'done', '*:ot2a': 'done', '*:ot2b': 'done', '*:ot2c': 'done',
      },
      reqs: {},
    }));
  });
  await page.goto('/artifacts/expansion.html?exp=shadowbringers-resistance');
  // MNK is fresh, but AST finished the chain — the guide stays folded.
  await expect(page.locator('#art-guide')).toBeEmpty();
  await expect(page.locator('#art-sheet button', { hasText: 'Review Completed Quests' })).toBeVisible();
  // The sheet still tells you which class has steps left.
  await expect(page.locator('#art-sheet tr', { hasText: 'Resistance is Not Futile' }).first()).toContainText('MNK');
  expect(errors).toEqual([]);
});

test('random-drop sources estimate runs from the stated rate', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('artifact:shadowbringers-resistance', JSON.stringify({
      jobs: { AST: true }, have: {},
      steps: { 'AST:1': 'done', 'AST:2': 'done', 'AST:3': 'done', 'AST:4': 'done' },
      reqs: { 'Step 4 (Change of Arms) done': true, 'Patch 5.45+': true },
    }));
    localStorage.setItem('artifact-showall:shadowbringers-resistance', '1');
  });
  await page.goto('/artifacts/expansion.html?exp=shadowbringers-resistance');
  const est = await page.evaluate(() => {
    const f = (window as unknown as { artSourceRuns: (n: number, s: unknown) => { runs: number | null; estimated: boolean } }).artSourceRuns;
    return {
      fate61: f(18, { yields: 1, rate: 'Random drop (~61%, buffed in 5.58)' }), // 18 / 0.61 → 30
      unknownRandom: f(20, { yields: 1, rate: 'Random drop' }),                  // no invented count
      guaranteed: f(20, { yields: 1, rate: 'Guaranteed with Gold medal' }),      // 20
      raid: f(18, { yields: 3, rate: null }),                                    // 6
    };
  });
  expect(est.fate61).toEqual({ runs: 30, estimated: true });
  expect(est.unknownRandom.runs).toBeNull();
  expect(est.guaranteed).toEqual({ runs: 20, estimated: false });
  expect(est.raid).toEqual({ runs: 6, estimated: false });
  // The estimated count is surfaced with a "~" in the guide.
  await expect(page.locator('#art-step-ot1')).toContainText('~30 runs');
  expect(errors).toEqual([]);
});


