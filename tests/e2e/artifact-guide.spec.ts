import { test, expect, Page } from '@playwright/test';

async function checkAllPrereqs(page: Page) {
  await page.locator('#art-prereq').first().waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
  for (let i = 0; i < 20; i++) {
    const boxes = page.locator('#art-prereq input[type=checkbox]:not(:checked)');
    if ((await boxes.count()) === 0) break;
    await boxes.first().evaluate(el => (el as HTMLInputElement).click());
  }
}

test('guide starts as one bubble, then grows a walkthrough', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/artifacts/expansion.html?exp=shadowbringers-resistance');

  // No mode toggle anymore — the split Guide/Grind tabs are gone.
  await expect(page.locator('#art-mode-toggle')).toHaveCount(0);
  // One starting bubble with the class picker.
  await expect(page.locator('#art-start')).toBeVisible();
  await expect(page.locator('#art-start')).toContainText('Start here');
  await expect(page.locator('#art-job-chips button')).toHaveCount(17);

  // Pick a class -> the guide becomes the walkthrough + unlock checklist.
  await page.locator('#art-job-chips button', { hasText: 'AST' }).evaluate(el => (el as HTMLButtonElement).click());
  await expect(page.locator('#art-start')).toHaveCount(0);
  await expect(page.locator('#art-guide')).toContainText('walkthrough');
  await expect(page.locator('#art-prereq')).toContainText('The City of Lost Angels');

  // Unlocking reveals step 1 as the focus card.
  await checkAllPrereqs(page);
  await expect(page.locator('#art-step-1')).toHaveAttribute('data-status', 'open');
  await expect(page.locator('#art-step-1 .art-mark-done')).toBeVisible();
  expect(errors).toEqual([]);
});

test('completed steps collapse into breadcrumbs and unlock the repeat reference', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('artifact:shadowbringers-resistance', JSON.stringify({
      jobs: { AST: true }, have: {},
      steps: { 'AST:1': 'done', 'AST:2': 'done', 'AST:3': 'done' },
      reqs: {},
    }));
    localStorage.setItem('artifact-showall:shadowbringers-resistance', '1');
  });
  await page.goto('/artifacts/expansion.html?exp=shadowbringers-resistance');
  // Finished steps are collapsed breadcrumbs carrying the repeat reference.
  await expect(page.locator('#art-step-1')).toHaveAttribute('data-status', 'done');
  await expect(page.locator('#art-step-3')).toHaveAttribute('data-status', 'done');
  await expect(page.locator('#art-step-1')).toContainText('Repeat reference');
  await expect(page.locator('#art-step-1')).toContainText('Thavnairian Scalepowder');
  // Frontier continues at the first open step; later gated steps show the lock.
  await expect(page.locator('#art-guide')).toContainText('3/');
  await expect(page.locator('#art-step-4')).toHaveAttribute('data-status', 'locked');
  await expect(page.locator('#art-step-4')).toContainText('unlock first');
  expect(errors).toEqual([]);
});

test('loaded character with completed steps skips them in the guide', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('artifact:shadowbringers-resistance', JSON.stringify({
      jobs: { AST: true }, have: {},
      steps: { 'AST:1': 'collect-owned', 'AST:2': 'collect-owned', 'AST:3': 'collect-owned' },
      reqs: {},
    }));
    localStorage.setItem('artifact-showall:shadowbringers-resistance', '1');
  });
  await page.goto('/artifacts/expansion.html?exp=shadowbringers-resistance');
  await expect(page.locator('#art-step-1')).toHaveAttribute('data-status', 'done');
  await expect(page.locator('#art-step-3')).toHaveAttribute('data-status', 'done');
  await expect(page.locator('#art-step-1')).toContainText('Repeat reference');
  await expect(page.locator('#art-step-4')).toContainText('Change of Arms');
  expect(errors).toEqual([]);
});

test('step-2 split farm: one row per memory type with live farm math', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('artifact:shadowbringers-resistance', JSON.stringify({
      jobs: { PLD: true }, have: {}, steps: { 'PLD:1': 'done' },
      reqs: {
        'A Resistance weapon from Fire in the Forge': true,
        'MSQ Vows of Virtue, Deeds of Cruelty': true,
        'Side quests: Where Eagles Nest + A Sober Proposal': true,
      },
    }));
  });
  await page.goto('/artifacts/expansion.html?exp=shadowbringers-resistance');
  await expect(page.locator('#art-step-2')).toContainText('For Want of a Memory');
  for (const name of ['Tortured Memories', 'Sorrowful Memories', 'Harrowing Memories']) {
    await expect(page.locator('#art-step-2')).toContainText(`20× ${name}`);
  }
  await expect(page.locator('#art-step-2')).toContainText('Sea of Clouds');
  await expect(page.locator('#art-step-2')).not.toContainText('180×');

  // Bank one memory; the aggregate need follows.
  await page.locator('#art-step-2 .art-havebtn.is-plus').first().evaluate(el => (el as HTMLElement).click());
  await expect(page.locator('#art-step-2')).toContainText('have 1, need 19');
  const need = await page.evaluate(() => {
    const exp = (window as unknown as { ARTIFACTS: { key: string; steps: unknown[] }[] }).ARTIFACTS
      .find(e => e.key === 'shadowbringers-resistance')!;
    const st = (exp.steps as { n: number }[]).find(s => s.n === 2);
    return (window as unknown as { artGrindForStep: (e: unknown, s: unknown) => { need: number } })
      .artGrindForStep(exp, st).need;
  });
  expect(need).toBe(59);
  expect(errors).toEqual([]);
});

test('one-time steps render inline in quest order', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('artifact:shadowbringers-resistance', JSON.stringify({
      jobs: { PLD: true }, have: {},
      steps: { 'PLD:1': 'done', 'PLD:2': 'done', 'PLD:3': 'done', 'PLD:4': 'done' },
      reqs: { 'Step 4 (Change of Arms) done': true, 'Patch 5.45+': true },
    }));
  });
  await page.goto('/artifacts/expansion.html?exp=shadowbringers-resistance');
  await expect(page.locator('#art-step-ot1')).toBeVisible();
  await expect(page.locator('#art-step-ot1')).toContainText('The Resistance Remembers');
  await expect(page.locator('#art-step-ot1')).toContainText('Haunting Memories of the Dying');
  await expect(page.locator('#art-step-ot1')).toContainText('Allagan Node');
  await expect(page.locator('#art-step-ot1')).toContainText('Gerolt');
  expect(errors).toEqual([]);
});

test('guide keeps focus on the furthest class, not a fresh one', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  // AST is through step 3 (step 4 open); MNK is brand new (step 1 open).
  await page.addInitScript(() => {
    localStorage.setItem('artifact:shadowbringers-resistance', JSON.stringify({
      jobs: { AST: true, MNK: true }, have: {},
      steps: { 'AST:1': 'done', 'AST:2': 'done', 'AST:3': 'done' },
      reqs: {
        'A Resistance weapon from Fire in the Forge': true,
        'MSQ Vows of Virtue, Deeds of Cruelty': true,
        'Side quests: Where Eagles Nest + A Sober Proposal': true,
        'An Augmented Base weapon from step 2': true,
        'A Recollection weapon from step 3': true,
        'Resistance Rank 10 + Castrum Lacus Litore cleared': true,
        "Gangos side quests: A Sign of What's to Come, Fit for a Queen, In the Queen’s Image": true,
        'Delubrum Reginae cleared': true,
      },
    }));
    localStorage.setItem('artifact-showall:shadowbringers-resistance', '1');
  });
  await page.goto('/artifacts/expansion.html?exp=shadowbringers-resistance');
  // The hero is AST's step 4 — the furthest progress, not MNK's step 1.
  await expect(page.locator('#art-guide .art-stephero')).toHaveAttribute('data-step', '4');
  await expect(page.locator('#art-guide .art-stephero')).toContainText('Change of Arms');
  // The fresh class's step 1 is still reachable, tucked in "Also in progress".
  await expect(page.locator('#art-guide .art-inprog')).toContainText('Also in progress');
  await expect(page.locator('#art-step-1')).toHaveAttribute('data-status', 'open');
  expect(errors).toEqual([]);
});

test('past steps fold into a dropdown and finished one-times leave the sheet', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('artifact:shadowbringers-resistance', JSON.stringify({
      jobs: { AST: true }, have: {},
      steps: { 'AST:1': 'done', 'AST:2': 'done', 'AST:3': 'done', 'AST:4': 'done', '*:ot1': 'done' },
      reqs: { 'One-time quest The Resistance Remembers done': true },
    }));
  });
  await page.goto('/artifacts/expansion.html?exp=shadowbringers-resistance');
  // Completed steps live in one "Past steps" fold, not as stacked cards.
  await expect(page.locator('#art-guide .art-past')).toContainText('Past steps');
  await expect(page.locator('#art-step-1')).toHaveAttribute('data-status', 'done');
  await page.locator('#art-guide .art-past > summary').click();
  await expect(page.locator('#art-guide .art-past')).toBeVisible();
  // A once-ever step that's done is gone from the grind reference sheet…
  await expect(page.locator('#art-sheet')).not.toContainText('The Resistance Remembers');
  // …while still-needed repeat steps remain.
  await expect(page.locator('#art-sheet')).toContainText('Timeworn Artifact');
  expect(errors).toEqual([]);
});

test('quest walkthrough links use the corrected wiki slug', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/artifacts/expansion.html?exp=shadowbringers-resistance');
  await page.locator('#art-job-chips button', { hasText: 'AST' }).evaluate(el => (el as HTMLButtonElement).click());
  await checkAllPrereqs(page);
  await expect(page.locator('#art-step-1 .art-questwalk')).toContainText('Quest walkthrough');
  await expect(page.locator('#art-step-1 a[href*="Resistance_Is_(Not)_Futile"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

