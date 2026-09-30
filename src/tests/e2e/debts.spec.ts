import { expect, test, type Page } from '@playwright/test';

async function addAccount(page: Page, name: string, opening: string, kind?: string) {
  await page.goto('/accounts/new');
  await page.getByLabel('שם החשבון').fill(name);
  if (kind) await page.getByLabel('סוג').selectOption({ label: kind });
  await page.getByLabel('יתרה היום').fill(opening);
  await page.getByLabel('נכון לתאריך').fill('2026-09-01');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-30T10:00:00+03:00') });
});

test('loan: Spitzer schedule like golden 14.3, payment splits interest', async ({ page }) => {
  await addAccount(page, 'עו"ש', '10,000');
  await page.goto('/debts/loans/new');
  await page.getByLabel('שם').fill('הלוואה לרכב');
  await page.getByLabel('סכום ההלוואה').fill('50,000');
  await page.getByLabel('ריבית (%)').fill('6');
  await page.getByLabel('מספר חודשים').fill('36');
  await page.getByLabel('תשלום ראשון').fill('2026-10-10');
  await page.getByLabel('הכסף נכנס לחשבון').selectOption({ label: 'עו"ש' });
  await expect(page.getByText('₪54,759.49')).toBeVisible();
  await page.getByRole('button', { name: 'שמירה' }).click();

  await expect(page.getByRole('heading', { name: 'הלוואה לרכב' })).toBeVisible();
  await expect(page.locator('section').first()).toContainText('₪50,000.00');
  const firstRow = page.getByRole('row').nth(1);
  await expect(firstRow).toContainText('₪1,521.10');
  await expect(firstRow).toContainText('₪250.00');

  await page.getByRole('button', { name: 'רישום תשלום' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByText('התשלום נרשם')).toBeVisible();
  await expect(page.locator('section').first()).toContainText('₪48,728.90'); // 50,000 − (1,521.10 − 250)

  await page.goto('/accounts');
  await expect(page.getByRole('link', { name: /^עו"ש/ })).toContainText('₪58,478.90'); // 10,000 + 50,000 − 1,521.10
  await page.goto('/');
  await expect(page.getByRole('link', { name: /חובות/ })).toContainText('₪1,521.10');
});

test('post-dated check stays pending until cleared, then moves the balance', async ({ page }) => {
  await addAccount(page, 'עו"ש', '10,000');
  await page.goto('/checks/new');
  await page.getByLabel('למי / ממי').fill('בעל הבית');
  await page.getByLabel('סכום').fill('4,800');
  await page.getByLabel("מספר צ'ק").fill('1001');
  await page.getByLabel('תאריך פירעון').fill('2026-10-15');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('link', { name: /בעל הבית/ })).toContainText('דחוי');

  await page.goto('/plan/forecast?days=30');
  await expect(page.getByText("צ'ק 1001 · בעל הבית")).toBeVisible();

  await page.goto('/accounts');
  await expect(page.getByRole('link', { name: /^עו"ש/ })).toContainText('₪10,000.00');
  await page.goto('/checks');
  await page.getByRole('button', { name: 'נפרע' }).click();
  await expect(page.getByRole('link', { name: /בעל הבית/ })).toContainText('נפרע');
  await page.goto('/accounts');
  await expect(page.getByRole('link', { name: /^עו"ש/ })).toContainText('₪5,200.00');
});

test('wish list: saving is a transfer to the savings account, progress updates', async ({ page }) => {
  await addAccount(page, 'עו"ש', '10,000');
  await addAccount(page, 'חיסכון', '0', 'חיסכון');
  await page.goto('/plan/wish/new');
  await page.getByLabel('מה', { exact: true }).fill('אופניים');
  await page.getByLabel('מחיר').fill('4,000');
  await page.getByLabel('חשבון החיסכון').selectOption({ label: 'חיסכון' });
  await page.getByLabel('חודש יעד').fill('2027-01');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await page.getByRole('link', { name: /אופניים/ }).click();
  await page.getByRole('button', { name: 'הפקדה לחיסכון' }).click();
  await page.getByRole('dialog').getByLabel('סכום').fill('1,000');
  await page.getByRole('dialog').getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByText('ההפקדה נרשמה')).toBeVisible();
  await expect(page.locator('section').first()).toContainText('₪1,000.00');
  await expect(page.locator('section').first()).toContainText('₪750.00'); // 3,000 over 4 months
  await page.goto('/');
  await expect(page.getByRole('link', { name: /תזרים החודש/ })).not.toContainText('₪1,000.00');
});
