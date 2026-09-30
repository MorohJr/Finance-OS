import { expect, test } from '@playwright/test';

test('business: rates first, calculator matches golden 14.4/14.5, move to tax reserve, expenses and VAT due', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-02T10:00:00+03:00') });
  for (const [name, kind] of [
    ['עו"ש עסקי', null],
    ['קופת מיסים', 'חיסכון'],
  ] as const) {
    await page.goto('/accounts/new');
    await page.getByLabel('שם החשבון').fill(name);
    if (kind) await page.getByLabel('סוג').selectOption({ label: kind });
    await page.getByRole('radio', { name: 'עסקי' }).click();
    await page.getByRole('button', { name: 'שמירה' }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
  }

  await page.goto('/business');
  await page.getByRole('link', { name: 'הגדרת עסק' }).click();
  await page.getByLabel('שם העסק').fill('סטודיו אלכס');
  await page.getByLabel('חשבון העסק').selectOption({ label: 'עו"ש עסקי' });
  await page.getByLabel('קופת מיסים (לא חובה)').selectOption({ label: 'קופת מיסים' });
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('heading', { name: 'סטודיו אלכס' })).toBeVisible();

  // Calculator asks for the user's own rates first (11.1).
  await page.getByRole('link', { name: 'הכנסה עסקית' }).click();
  await expect(page.getByText('לפני שימוש במחשבון, הזן את אחוז מס ההכנסה')).toBeVisible();
  await page.getByLabel('מס הכנסה על הרווח העסקי (%)').fill('20');
  await page.getByRole('radio', { name: 'אחוז מהרווח' }).click();
  await page.getByLabel('ביטוח לאומי ומס בריאות (%)').fill('16');
  await page.getByRole('button', { name: 'שמירה' }).click();

  // Golden 14.4 + 14.5: ₪5,000 before VAT.
  await page.getByLabel('סכום', { exact: true }).fill('5,000');
  const box = page.locator('section[aria-live]');
  await expect(box).toContainText('₪900.00');
  await expect(box).toContainText('₪5,900.00');
  await expect(box).toContainText('₪1,000.00');
  await expect(box).toContainText('₪800.00');
  await expect(box).toContainText('₪2,700.00');
  await expect(box).toContainText('₪3,200.00');
  await page.getByRole('radio', { name: 'כולל מע"מ' }).click();
  await page.getByLabel('סכום', { exact: true }).fill('5,900');
  await expect(box).toContainText('₪5,000.00');
  await page.getByLabel('ממי').fill('לקוח א');
  await page.getByRole('button', { name: 'שמירת הכנסה' }).click();
  await page.getByRole('button', { name: 'העבר ₪2,700.00 לקופת מיסים' }).click();
  await expect(page.getByText('הועבר לקופת מיסים')).toBeVisible();

  // Business expense: fuel ₪590 incl. VAT → VAT ₪90, deductible ₪60.
  await page.getByRole('link', { name: 'הוצאה עסקית' }).click();
  await page.getByLabel('סכום כולל מע"מ').fill('590');
  await expect(page.getByLabel('מע"מ בחשבונית')).toHaveValue('90');
  await page.getByLabel('סוג הוצאה').selectOption({ label: 'רכב פרטי (דלק, ביטוח, טיפולים, חניה) · 45%' });
  await expect(page.getByText('₪60.00')).toBeVisible();
  await page.getByRole('button', { name: 'שמירה' }).click();

  // VAT for Sep–Oct so far: 900 − 60 = 840.
  await expect(page.getByRole('heading', { name: 'סטודיו אלכס' })).toBeVisible();
  await expect(page.getByText(/לתשלום\s*₪840.00/)).toBeVisible();

  await page.goto('/accounts');
  await expect(page.getByRole('link', { name: /^קופת מיסים/ })).toContainText('₪2,700.00');
  await expect(page.getByRole('link', { name: /^עו"ש עסקי/ })).toContainText('₪2,610.00'); // 5,900 − 2,700 − 590

  // "More" shows the business first, and ➕ offers business income.
  await page.goto('/more');
  await expect(page.getByRole('link').filter({ hasText: /./ }).nth(0)).toContainText('סטודיו אלכס');
});
