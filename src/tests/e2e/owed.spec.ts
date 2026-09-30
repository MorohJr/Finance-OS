import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-01T10:00:00+03:00') });
  await page.goto('/accounts/new');
  await page.getByLabel('שם החשבון').fill('עו"ש');
  await page.getByLabel('יתרה היום').fill('20000');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('heading', { name: 'עו"ש' })).toBeVisible();
});

test('amount fields add thousands separators while typing', async ({ page }) => {
  await page.goto('/transactions/new?kind=expense');
  const amount = page.getByLabel('סכום');
  await amount.pressSequentially('1234567.891');
  await expect(amount).toHaveValue('1,234,567.89');
  await page.goto('/accounts');
  await expect(page.getByRole('link', { name: /^עו"ש/ })).toContainText('₪20,000.00');
});

test('debt in a settlement: charges, fixed monthly payments, net worth and forecast', async ({ page }) => {
  await page.goto('/debts?tab=owed');
  await page.getByRole('link', { name: 'חוב חדש' }).click();
  await page.getByLabel('למי', { exact: true }).fill('הוצאה לפועל');
  await page.getByLabel('סוג', { exact: true }).selectOption({ label: 'הוצאה לפועל' });
  await page.getByLabel('סכום החוב').fill('12000');
  await page.getByText('הסדר תשלומים', { exact: true }).click();
  await page.getByLabel('תשלום חודשי').fill('1500');
  await page.getByLabel('יום בחודש').selectOption('10');
  await page.getByLabel('מתחיל מ').fill('2026-10-01');
  await page.getByLabel('מספר תיק (לא חובה)').fill('01-12345-26');
  await page.getByRole('button', { name: 'שמירה' }).click();

  const hero = page.locator('section').first();
  await expect(hero).toContainText('₪12,000.00');
  await expect(hero).toContainText('התשלום הבא: 10/10/2026');
  await expect(hero).toContainText('עוד 8 תשלומים, עד 10/05/2027');

  // Legal fees are added to the debt.
  await page.getByRole('button', { name: 'הוספת קנס / ריבית / עמלה' }).click();
  await page.getByRole('dialog').getByLabel('סוג').selectOption({ label: 'הוצאות משפטיות' });
  await page.getByRole('dialog').getByLabel('סכום התוספת').fill('600');
  await page.getByRole('dialog').getByRole('button', { name: 'שמירה' }).click();
  await expect(hero).toContainText('₪12,600.00');

  // Pay the first installment.
  await page.getByRole('button', { name: 'רישום תשלום' }).click();
  await expect(page.getByRole('dialog').getByLabel('סכום')).toHaveValue('1,500');
  await page.getByRole('dialog').getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByText('התשלום נרשם')).toBeVisible();
  await expect(hero).toContainText('₪11,100.00');

  // Net worth: 20,000 − 1,500 paid − 11,100 still owed; the monthly metric counts the arrangement.
  await page.goto('/');
  await expect(page.locator('header').first()).toContainText('₪7,400.00');
  await expect(page.getByRole('link', { name: /חובות/ })).toContainText('₪1,500.00');
  await page.goto('/plan/forecast?days=60');
  await expect(page.getByText('הוצאה לפועל').first()).toBeVisible();
});
