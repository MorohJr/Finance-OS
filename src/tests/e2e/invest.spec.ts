import { expect, test } from '@playwright/test';

test('portfolio: TASE security in agorot, buy, price update, value and gain; pension in net worth', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-30T10:00:00+03:00') });
  await page.goto('/accounts/new');
  await page.getByLabel('שם החשבון').fill('מסחר');
  await page.getByLabel('סוג').selectOption({ label: 'חשבון מסחר' });
  await page.getByLabel('יתרה היום').fill('5,000');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('heading', { name: 'מסחר' })).toBeVisible();

  await page.goto('/investments/security/new');
  await page.getByLabel('סימול').fill('tchtla35');
  await page.getByLabel('שם', { exact: true }).fill('תכלית ת"א 35');
  await page.getByLabel('סוג', { exact: true }).selectOption({ label: 'קרן סל' });
  await page.getByLabel('סקטור').selectOption({ label: 'קרנות מחקות מדד' });
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('heading', { name: 'TCHTLA35' })).toBeVisible();

  // Buy 100 units at 2,000 agorot (₪20): gross ₪2,000, fee ₪10.
  await page.getByRole('link', { name: 'עסקה' }).click();
  await page.getByLabel('כמות').fill('100');
  await page.getByLabel('מחיר ליחידה (אגורות (ת"א))').fill('2000');
  await expect(page.getByText(/₪2,000.00/)).toBeVisible();
  await page.getByLabel('עמלה (₪)').fill('10');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('heading', { name: 'TCHTLA35' })).toBeVisible();

  // Price update to 2,150 agorot → value ₪2,150, gain ₪140.
  await page.goto('/investments/prices');
  await page.getByLabel('תכלית ת"א 35 מחיר אחרון').fill('2150');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByText('המחירים נשמרו')).toBeVisible();
  const hero = page.locator('section').first();
  await expect(hero).toContainText('₪2,150.00');
  await expect(hero).toContainText('+₪140.00');
  await expect(hero).toContainText('₪2,010.00');

  // Brokerage cash went down by gross + fee.
  await page.goto('/accounts');
  await expect(page.getByRole('link', { name: /^מסחר/ })).toContainText('₪2,990.00');

  // Pension fund with a snapshot.
  await page.goto('/pension/new');
  await page.getByLabel('שם', { exact: true }).fill('קרן פנסיה');
  await page.getByLabel('חברה מנהלת').fill('מגדל');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await page.getByRole('button', { name: 'עדכון יתרה' }).click();
  await page.getByRole('dialog').getByLabel('צבירה').fill('100,000');
  await page.getByRole('dialog').getByRole('button', { name: 'שמירה' }).click();
  await expect(page.locator('section').first()).toContainText('₪100,000.00');

  // Net worth = cash 2,990 + portfolio 2,150 + pension 100,000.
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'שווי נטו' })).toContainText('₪105,140.00');
  await page.getByRole('tab', { name: 'נכסים' }).click();
  await expect(page.getByText('תיק ההשקעות')).toBeVisible();
  await expect(page.getByText('פיזור הנכסים')).toBeVisible();
});
