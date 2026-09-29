import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const nav = (page: Page) => page.getByRole('navigation', { name: 'ניווט ראשי' });

async function addAccount(page: Page, name: string, opening: string, kind?: string) {
  await page.goto('/accounts/new');
  await page.getByLabel('שם החשבון').fill(name);
  if (kind) await page.getByLabel('סוג').selectOption({ label: kind });
  await page.getByLabel('יתרה היום').fill(opening);
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

/** Saves a transaction and waits for the write to finish. */
async function saveTx(page: Page) {
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByText('התנועה נשמרה')).toBeVisible();
}

async function quickAdd(page: Page, kind: 'הוצאה' | 'הכנסה' | 'העברה') {
  await nav(page).getByRole('button', { name: 'הוספה' }).click();
  await page.getByRole('dialog', { name: 'הוספה מהירה' }).getByRole('button', { name: kind }).click();
}

test('account with opening balance, expense, transfer: balances are sums of transactions', async ({ page }) => {
  await addAccount(page, 'עו"ש לאומי', '1,000');
  await expect(page.locator('section').first()).toContainText('₪1,000.00');
  await addAccount(page, 'חיסכון', '0', 'חיסכון');

  // Income 500 + expense 200 on the bank account.
  await quickAdd(page, 'הכנסה');
  await page.getByLabel('סכום').fill('500');
  await page.getByLabel('חשבון', { exact: true }).selectOption({ label: 'עו"ש לאומי' });
  await saveTx(page);

  await quickAdd(page, 'הוצאה');
  await page.getByLabel('סכום').fill('200');
  await page.getByLabel('חשבון', { exact: true }).selectOption({ label: 'עו"ש לאומי' });
  await page.getByLabel('בית עסק / אדם').fill('שופרסל');
  await page.getByLabel('קטגוריה').selectOption({ label: 'מזון וסופר' });
  await saveTx(page);

  // Transfer 300 to savings.
  await quickAdd(page, 'העברה');
  await page.getByLabel('סכום').fill('300');
  await page.getByLabel('מחשבון').selectOption({ label: 'עו"ש לאומי' });
  await page.getByLabel('לחשבון').selectOption({ label: 'חיסכון' });
  await saveTx(page);

  // Golden example 14.1 through the UI.
  await page.goto('/accounts');
  await expect(page.getByRole('link', { name: /עו"ש לאומי/ })).toContainText('₪1,000.00');
  await expect(page.getByRole('link', { name: /חיסכון.*₪/ })).toContainText('₪300.00');

  await page.goto('/');
  await expect(page.getByRole('link', { name: /תזרים החודש/ })).toContainText('+₪300.00'); // 500 − 200, transfer excluded
  await expect(page.getByText('קטגוריות החודש')).toBeVisible();

  // Search and delete with undo.
  await nav(page).getByRole('link', { name: 'תנועות' }).click();
  await page.getByPlaceholder('בית עסק, תיאור, סכום, תגית').fill('שופרסל');
  await expect(page.getByText('1 תנועות')).toBeVisible();
  await page.getByRole('link', { name: /שופרסל/ }).click();
  await page.getByRole('button', { name: 'מחיקה' }).click();
  await expect(page.getByText('התנועה נמחקה')).toBeVisible();
  await page.getByRole('button', { name: 'ביטול' }).click();
  await expect(page.getByRole('link', { name: /שופרסל/ })).toBeVisible();
});

test('adjustment requires a note, and a second opening balance is refused', async ({ page }) => {
  await addAccount(page, 'מזומן בארנק', '100', 'מזומן');
  await page.goto('/transactions/new?kind=adjustment');
  await page.getByLabel('סכום').fill('10');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByText('תיקון דורש הערה.')).toBeVisible();

  await page.goto('/transactions/new?kind=opening_balance');
  await page.getByLabel('סכום').fill('10');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByText(/כבר יש יתרת פתיחה/)).toBeVisible();
});

test('categories: add a sub-category', async ({ page }) => {
  await page.goto('/settings/categories');
  await page.getByRole('button', { name: 'קטגוריה חדשה' }).click();
  const sheet = page.getByRole('dialog', { name: 'קטגוריה חדשה' });
  await sheet.getByLabel('שם').fill('ארוחות צהריים');
  await sheet.getByLabel('קטגוריית אב').selectOption({ label: 'מסעדות ובתי קפה' });
  await sheet.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('button', { name: /› ארוחות צהריים/ })).toBeVisible();
});

test('PIN locks the app after reload and unlocks with the right code', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'הגדרת קוד' }).click();
  await page.getByLabel('קוד חדש (4–6 ספרות)').fill('2468');
  await page.getByLabel('אימות הקוד').fill('2468');
  await page.getByRole('button', { name: 'שמירה' }).first().click();
  await expect(page.getByText('האפליקציה ננעלת אחרי 5 דקות ברקע')).toBeVisible();

  await page.reload();
  const lock = page.getByRole('dialog', { name: 'הזן קוד' });
  await expect(lock).toBeVisible();
  for (const d of '1111') await lock.getByRole('button', { name: d, exact: true }).click();
  await lock.getByRole('button', { name: 'המשך' }).click();
  await expect(lock.getByRole('alert')).toHaveText('קוד שגוי');
  for (const d of '2468') await lock.getByRole('button', { name: d, exact: true }).click();
  await lock.getByRole('button', { name: 'המשך' }).click();
  await expect(lock).toBeHidden();
});

test('CSV export for the accountant', async ({ page }) => {
  await addAccount(page, 'עסק', '0');
  await page.goto('/transactions/new?kind=income');
  await page.getByLabel('סכום').fill('1,234.56');
  await page.getByLabel('תיאור').fill('=SUM(A1)');
  await saveTx(page);
  await page.goto('/settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ייצוא CSV' }).click();
  const text = await readFile(await (await download).path(), 'utf8');
  expect(text).toContain('תאריך,סוג,סכום');
  expect(text).toContain('1234.56');
  expect(text).toContain("'=SUM(A1)");
});
