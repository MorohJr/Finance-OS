import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.setTimeout(180_000);

// Owner request 01/10/2026: insights, card and account carousels, four tabs of charts, 3 recent transactions.
test('dashboard with a year of demo data: every section, every tab, no accessibility violations', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'טעינת נתוני הדגמה' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'טען הדגמה' }).click();
  await expect(page.getByText('מצב הדגמה', { exact: true })).toBeVisible({ timeout: 150_000 });
  // The banner shows as soon as the real data is stashed; the app opens home when generation ends.
  await expect(page.getByRole('tablist', { name: 'תצוגת הדשבורד' })).toBeVisible({ timeout: 150_000 });
  await expect(page.getByRole('heading', { name: 'תובנות' })).toBeVisible();
  await expect(page.getByRole('group', { name: /כרטיסי אשראי/ }).getByRole('link')).not.toHaveCount(0);
  await expect(page.getByRole('group', { name: /חשבונות/ }).getByRole('link')).not.toHaveCount(0);

  const recent = page.locator('section').filter({ has: page.getByRole('heading', { name: 'תנועות אחרונות' }) }).locator('a[href*="/transactions/"]');
  await expect(recent).toHaveCount(3);

  const tabs: [string, string][] = [
    ['החודש', 'הכנסות מול הוצאות'],
    ['נכסים', 'פיזור הנכסים'],
    ['עתיד', 'יתרה צפויה, 30 יום'],
    ['עסק', 'הכנסות החודש'],
  ];
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const [tab, text] of tabs) {
      await page.getByRole('tab', { name: tab }).click();
      await expect(page.getByRole('tabpanel')).toContainText(text);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      const bad = r.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical').map((v) => `${scheme}/${tab} · ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      expect(bad, bad.join('\n')).toEqual([]);
    }
  }
});
