import { expect, test } from '@playwright/test';

test.setTimeout(180_000);

test('demo: load a rich family year, browse every area, then get the real data back', async ({ page }) => {
  await page.goto('/accounts/new');
  await page.getByLabel('שם החשבון').fill('החשבון האמיתי שלי');
  await page.getByLabel('יתרה היום').fill('1234');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('heading', { name: 'החשבון האמיתי שלי' })).toBeVisible();

  await page.goto('/settings');
  await page.getByRole('button', { name: 'טעינת נתוני הדגמה' }).click();
  const t0 = Date.now();
  await page.getByRole('dialog').getByRole('button', { name: 'טען הדגמה' }).click();
  await expect(page.getByText('מצב הדגמה', { exact: true })).toBeVisible({ timeout: 150_000 });
  await expect(page.getByText('תנועות אחרונות')).toBeVisible();
  console.log(`demo generated in ${Date.now() - t0}ms`);

  // Every area has content.
  const checks: [string, RegExp | string][] = [
    ['/accounts', 'עו"ש לאומי'],
    ['/transactions', /תנועות$/],
    ['/plan/budget', 'מזון וסופר'],
    ['/plan/recurring', 'ארנונה'],
    ['/plan/wish', 'רכב חשמלי'],
    ['/plan/forecast', 'אירועים צפויים'],
    ['/debts', 'הלוואה לרכב משפחתי'],
    ['/debts?tab=owed', 'הוצאה לפועל'],
    ['/debts?tab=given', 'יואב'],
    ['/checks?tab=received', 'דייר'],
    ['/investments', 'SPY'],
    ['/pension', 'הראל פנסיה'],
    ['/salary', 'טק-גלובל'],
    ['/business', 'מע"מ'],
    ['/reports?kind=year', 'הוצאות לפי קטגוריה'],
  ];
  for (const [path, text] of checks) {
    await page.goto(path);
    await expect(page.getByText(text).first(), path).toBeVisible();
  }
  await page.goto('/import');
  await expect(page.getByText('לא זמין במצב הדגמה').first()).toBeVisible();

  // Back to the real data.
  await page.getByRole('button', { name: 'החזר את הנתונים שלי' }).click();
  await expect(page.getByText('הנתונים שלך חזרו')).toBeVisible();
  await page.goto('/accounts');
  await expect(page.getByText('החשבון האמיתי שלי')).toBeVisible();
  await expect(page.getByText('עו"ש לאומי')).toHaveCount(0);
  await expect(page.getByText('מצב הדגמה', { exact: true })).toHaveCount(0);
});
