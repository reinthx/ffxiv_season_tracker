import { test, expect, Page } from '@playwright/test';

// Lockstep walkthrough of the full Resistance chain in quest order using the
// collapsible step cards: 1, 2, 3, 4 → The Resistance Remembers → 5 →
// Spare Parts / Tell Me a Story / A Fond Memory → 6. At every phase, later
// steps must stay hidden and the current step must unlock exactly when its
// prefix + prerequisites are done.
async function checkAllPrereqs(page: Page) {
  await page.locator('#art-prereq').first().waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
  for (let i = 0; i < 20; i++) {
    const boxes = page.locator('#art-prereq input[type=checkbox]:not(:checked)');
    if ((await boxes.count()) === 0) break;
    await boxes.first().evaluate(el => (el as HTMLInputElement).click());
  }
}

async function markStep(page: Page, n: number | string) {
  await page.locator(`#art-step-${n} .art-mark-done`).first().evaluate(el => (el as HTMLElement).click());
}

async function markOnce(page: Page, n: number | string) {
  await page.locator(`#art-step-${n} .art-mark-done`).first().evaluate(el => (el as HTMLElement).click());
}

test('resistance unlock order follows the quest chain exactly', async ({ page }) => {
  const errors: string[] = [];
  const bad: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('401') && !m.text().includes('404')) errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
  await page.addInitScript(() => {
    localStorage.setItem('artifact:shadowbringers-resistance', JSON.stringify({
      jobs: { AST: true }, have: {}, steps: {}, reqs: {},
    }));
  });
  await page.goto('/artifacts/expansion.html?exp=shadowbringers-resistance');

  const prereq = () => page.locator('#art-prereq');
  const step = (n: number | string) => page.locator(`#art-step-${n}`);

  // Phase 0 — fresh: nothing reachable, step-1 prereqs surface
  await expect(prereq()).toContainText('The City of Lost Angels');
  await expect(prereq()).toContainText('Hail to the Queen');
  await expect(step(1)).toHaveCount(0);

  // Phase 1 — step-1 reqs checked: step 1 only, step 2 hidden
  await checkAllPrereqs(page);
  await expect(step(1)).toHaveAttribute('data-status', 'open');
  await expect(step(2)).toHaveCount(0);

  // Phase 2 — step 1 completed: step-2 reqs surface, step 2 hidden
  await markStep(page, 1);
  await expect(prereq()).toContainText('Where Eagles Nest');
  await expect(step(2)).toHaveCount(0);

  // Phase 3 — step-2 reqs checked: step 2 only
  await checkAllPrereqs(page);
  await expect(step(2)).toHaveAttribute('data-status', 'open');
  await expect(step(3)).toHaveCount(0);

  // Phase 4 — step 2 completed: step-3 req surfaces
  await markStep(page, 2);
  await expect(prereq()).toContainText('An Augmented Base weapon from step 2');
  await expect(step(3)).toHaveCount(0);

  // Phase 5 — step-3 req checked: step 3 only
  await checkAllPrereqs(page);
  await expect(step(3)).toHaveAttribute('data-status', 'open');
  await expect(step(4)).toHaveCount(0);

  // Phase 6 — step 3 completed: step-4 reqs surface, step 4 + OT1 hidden
  await markStep(page, 3);
  await expect(prereq()).toContainText('Resistance Rank 10');
  await expect(step(4)).toHaveCount(0);
  await expect(step('ot1')).toHaveCount(0);

  // Phase 7 — step-4 reqs checked: step 4 only
  await checkAllPrereqs(page);
  await expect(step(4)).toHaveAttribute('data-status', 'open');
  await expect(step('ot1')).toHaveCount(0);

  // Phase 8 — step 4 completed: OT1 reqs surface, OT1 + step 5 hidden
  await markStep(page, 4);
  await expect(prereq()).toContainText('Patch 5.45');
  await expect(step('ot1')).toHaveCount(0);
  await expect(step(5)).toHaveCount(0);

  // Phase 9 — OT1 reqs checked: OT1 only
  await checkAllPrereqs(page);
  await expect(step('ot1')).toHaveAttribute('data-status', 'open');
  await expect(step(5)).toHaveCount(0);

  // Phase 10 — OT1 completed: step-5 req surfaces, step 5 + OT2 hidden
  await markOnce(page, 'ot1');
  await expect(prereq()).toContainText('The Resistance Remembers done');
  await expect(step(5)).toHaveCount(0);
  await expect(step('ot2a')).toHaveCount(0);

  // Phase 11 — step-5 req checked: step 5 only
  await checkAllPrereqs(page);
  await expect(step(5)).toHaveAttribute('data-status', 'open');
  await expect(step('ot2a')).toHaveCount(0);

  // Phase 12 — step 5 completed: OT2 reqs surface, trio + step 6 hidden
  await markStep(page, 5);
  await expect(prereq()).toContainText('Zadnor unlocked');
  await expect(step('ot2a')).toHaveCount(0);
  await expect(step(6)).toHaveCount(0);

  // Phase 13 — OT2 reqs checked: the whole trio opens together, step 6 hidden
  await checkAllPrereqs(page);
  await expect(step('ot2a')).toHaveAttribute('data-status', 'open');
  await expect(step('ot2b')).toHaveAttribute('data-status', 'open');
  await expect(step('ot2c')).toHaveAttribute('data-status', 'open');
  await expect(step(6)).toHaveCount(0);

  // Phase 14 — trio completed: step-6 reqs surface, step 6 hidden
  await markOnce(page, 'ot2a');
  await markOnce(page, 'ot2b');
  await markOnce(page, 'ot2c');
  await expect(prereq()).toContainText('A Done Deal');
  await expect(step(6)).toHaveCount(0);

  // Phase 15 — step-6 reqs checked: step 6 only
  await checkAllPrereqs(page);
  await expect(step(6)).toHaveAttribute('data-status', 'open');

  // Phase 16 — step 6 completed: the whole guide folds away to the bottom.
  await markStep(page, 6);
  await expect(page.locator('#art-guide')).toBeEmpty();
  await expect(page.locator('#art-completed-guide')).toContainText('Completed quests');
  await expect(page.locator('#confetti-canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/artifact-locks.png' });

  const authNoise = bad.some(u => u.includes('/api/me'));
  const realErrors = errors.filter(e => !(authNoise && /Failed to load resource.*status of (401|404)/.test(e)));
  expect(realErrors).toEqual([]);
});
