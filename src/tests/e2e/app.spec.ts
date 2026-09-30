import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('opens in Hebrew RTL with five bottom tabs', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  const nav = page.getByRole('navigation', { name: 'ניווט ראשי' });
  await expect(nav.getByRole('link')).toHaveText(['בית', 'תנועות', 'תכנון', 'עוד']);
  await expect(nav.getByRole('button', { name: 'הוספה' })).toBeVisible();

  // Home tab sits on the right edge in RTL.
  const home = await nav.getByRole('link', { name: 'בית' }).boundingBox();
  const more = await nav.getByRole('link', { name: 'עוד' }).boundingBox();
  expect(home!.x).toBeGreaterThan(more!.x);
});

test('tabs navigate and the ➕ opens a bottom sheet', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'ניווט ראשי' });
  await nav.getByRole('link', { name: 'תכנון' }).click();
  await expect(page.getByRole('heading', { name: 'תכנון' })).toBeVisible();
  await nav.getByRole('link', { name: 'עוד' }).click();
  await expect(page.getByRole('link', { name: 'הגדרות', exact: true })).toBeVisible();
  await nav.getByRole('button', { name: 'הוספה' }).click();
  await expect(page.getByRole('dialog', { name: 'הוספה מהירה' })).toBeVisible();
});

test('dark theme can be pinned from settings', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('radio', { name: 'כהה' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('works offline after the first visit (airplane mode)', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.active?.state;
  });
  await page.reload(); // let the service worker control the page
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('שווי נטו', { exact: true }).first()).toBeVisible();
  await page.getByRole('navigation', { name: 'ניווט ראשי' }).getByRole('link', { name: 'עוד' }).click();
  await expect(page.getByRole('heading', { name: 'עוד' })).toBeVisible();
  await context.setOffline(false);
});

test('backup and restore complete a full round trip in the UI', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('radio', { name: 'לפי המכשיר' })).toHaveAttribute('aria-checked', 'true');

  // Export (encrypted).
  await page.getByLabel('סיסמה להצפנה (לא חובה)').fill('pw-1234');
  await page.getByLabel('אימות סיסמה').fill('pw-1234');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ייצוא גיבוי' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^finance-os-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await download.path();
  const text = await readFile(file, 'utf8');
  expect(JSON.parse(text).encrypted).toBe(true);
  await expect(page.getByText('קובץ הגיבוי נשמר')).toBeVisible();

  // Change something after the backup.
  await page.getByRole('radio', { name: 'כהה' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // Restore: password, summary, two confirmations.
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByLabel('הקובץ מוצפן. הזן את הסיסמה:').fill('wrong');
  await page.getByRole('button', { name: 'בדיקת הקובץ' }).click();
  await expect(page.getByRole('alert')).toHaveText('סיסמה שגויה, או שהקובץ פגום.');
  await page.getByLabel('הקובץ מוצפן. הזן את הסיסמה:').fill('pw-1234');
  await page.getByRole('button', { name: 'בדיקת הקובץ' }).click();
  await page.getByRole('button', { name: 'המשך' }).click();
  await page.getByRole('button', { name: 'כן, להחליף' }).click();
  await page.getByRole('button', { name: 'שחזר עכשיו' }).click();
  await expect(page.getByText('השחזור הושלם')).toBeVisible();

  // Back to the state at backup time.
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radio', { name: 'לפי המכשיר' })).toHaveAttribute('aria-checked', 'true');
});
