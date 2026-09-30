import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function seed(page: Page) {
  await page.goto('/accounts/new');
  await page.getByLabel('שם החשבון').fill('עו"ש');
  await page.getByLabel('יתרה היום').fill('5,000');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('heading', { name: 'עו"ש' })).toBeVisible();
  await page.goto('/transactions/new?kind=expense');
  await page.getByLabel('סכום').fill('120');
  await page.getByLabel('קטגוריה').selectOption({ label: 'מזון וסופר' });
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByText('התנועה נשמרה')).toBeVisible();
}

const SCREENS = ['/', '/transactions', '/transactions/new?kind=expense', '/accounts', '/plan', '/plan/budget', '/plan/recurring/new', '/plan/forecast', '/more', '/settings', '/debts', '/checks/new', '/investments', '/pension', '/salary', '/business', '/tax', '/reports', '/import', '/cards/new', '/plan/wish/new'];

for (const scheme of ['light', 'dark'] as const) {
  test(`no serious accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await seed(page);
    const problems: string[] = [];
    for (const path of SCREENS) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(150);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      for (const v of r.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')) {
        problems.push(`${path} · ${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
}
