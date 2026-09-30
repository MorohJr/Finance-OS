import { expect, test, type Page } from '@playwright/test';

async function addBank(page: Page, opening = '5,000') {
  await page.goto('/accounts/new');
  await page.getByLabel('שם החשבון').fill('עו"ש');
  await page.getByLabel('יתרה היום').fill(opening);
  await page.getByLabel('נכון לתאריך').fill('2026-09-01');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('heading', { name: 'עו"ש' })).toBeVisible();
}

async function addRecurring(page: Page, o: { name: string; kind?: string; amount: string; frequency?: string; next: string; auto?: boolean }) {
  await page.goto('/plan/recurring/new');
  await page.getByLabel('שם').fill(o.name);
  if (o.kind) await page.getByLabel('סוג').selectOption({ label: o.kind });
  if (o.frequency) await page.getByLabel('תדירות').selectOption({ label: o.frequency });
  await page.getByLabel('סכום', { exact: true }).fill(o.amount);
  await page.getByLabel('מועד הבא').fill(o.next);
  if (o.auto) await page.getByText('ליצור תנועה אוטומטית ביום החיוב').click();
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('heading', { name: 'חשבונות קבועים ומנויים' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-30T10:00:00+03:00') });
});

test('bimonthly bill: mark paid creates a transaction and advances two months', async ({ page }) => {
  await addBank(page);
  await addRecurring(page, { name: 'ארנונה', amount: '640', frequency: 'דו-חודשי', next: '2026-09-30' });
  await expect(page.getByText('₪320.00')).toBeVisible(); // monthly normalized
  const row = page.locator('div', { has: page.getByRole('link', { name: /ארנונה/ }) }).last();
  await row.getByRole('button', { name: 'שולם' }).click();
  await expect(page.getByText('נרשם כשולם')).toBeVisible();
  await expect(page.getByRole('link', { name: /ארנונה/ })).toContainText('30/11/2026');
  await page.goto('/accounts');
  await expect(page.getByRole('link', { name: /^עו"ש/ })).toContainText('₪4,360.00');
});

test('autoCreate: passed dates become pending transactions to confirm', async ({ page }) => {
  await addBank(page);
  await addRecurring(page, { name: 'נטפליקס', kind: 'מנוי', amount: '54.90', next: '2026-08-15', auto: true });
  await page.goto('/');
  await expect(page.getByText('2 תנועות ממתינות לאישור')).toBeVisible();
  await page.getByText('2 תנועות ממתינות לאישור').click();
  await page.getByRole('button', { name: 'אישור' }).first().click();
  await page.getByRole('button', { name: 'ביטול' }).first().click();
  await expect(page.getByText('ממתינות לאישור')).toBeHidden();
  await page.goto('/accounts');
  await expect(page.getByRole('link', { name: /^עו"ש/ })).toContainText('₪4,945.10');
});

test('budget: spending against a category budget, with states', async ({ page }) => {
  await addBank(page);
  await page.goto('/plan/budget');
  await page.getByRole('link', { name: 'הגדרת תקציבים' }).click();
  await page.getByRole('button', { name: /^מזון וסופר/ }).click();
  await page.getByRole('dialog').getByLabel('תקציב חודשי').fill('1,000');
  await page.getByRole('dialog').getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.goto('/transactions/new?kind=expense');
  await page.getByLabel('סכום').fill('850');
  await page.getByLabel('קטגוריה').selectOption({ label: 'מזון וסופר' });
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByText('התנועה נשמרה')).toBeVisible();

  await page.goto('/plan/budget');
  const line = page.getByRole('button', { name: /מזון וסופר/ });
  await expect(line).toContainText('₪850.00');
  await expect(line).toContainText('85%');
  await expect(line.getByRole('meter')).toHaveAttribute('aria-valuenow', '85');
  await page.goto('/');
  await expect(page.getByRole('link', { name: /תקציב החודש/ })).toContainText('₪150.00');
});

test('forecast: rent pushes the balance below zero and warns', async ({ page }) => {
  await addBank(page, '3,000');
  await addRecurring(page, { name: 'שכר דירה', amount: '4,800', next: '2026-10-01' });
  await page.goto('/plan/forecast?days=30');
  await expect(page.getByRole('alert')).toContainText('01/10/2026');
  await expect(page.getByText('שכר דירה')).toBeVisible();
  await page.goto('/');
  // Insight at the top, and the forecast chart in the "future" tab.
  await expect(page.getByRole('link', { name: /צפוי לרדת ל-.*01\/10\/2026/ })).toBeVisible();
  await page.getByRole('tab', { name: 'עתיד' }).click();
  await expect(page.getByText('יתרה צפויה, 30 יום')).toBeVisible();
  await expect(page.getByText('שכר דירה')).toBeVisible();
});
