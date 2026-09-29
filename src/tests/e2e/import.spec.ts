import { expect, test } from '@playwright/test';

const CARD_CSV = [
  'פירוט עסקאות לכרטיס ויזה 4821',
  '',
  'תאריך עסקה,שם בית העסק,סכום עסקה,סכום חיוב,תאריך חיוב,פירוט נוסף',
  '05/09/2026,שופרסל דיל,342.90,342.90,10/10/2026,',
  '07/09/2026,קפה גרג,18.00,18.00,10/10/2026,',
  '07/09/2026,קפה גרג,18.00,18.00,10/10/2026,',
  '12/07/2026,KSP מחשבים,"2,400.00",400.00,10/10/2026,תשלום 3 מתוך 6',
].join('\n');

const file = { name: 'visa-09-2026.csv', mimeType: 'text/csv', buffer: Buffer.from('﻿' + CARD_CSV, 'utf8') };

test('card import wizard: mapping, preview, commit; the same file again imports nothing; undo', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-30T10:00:00+03:00') });
  await page.goto('/accounts/new');
  await page.getByLabel('שם החשבון').fill('עו"ש');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('heading', { name: 'עו"ש' })).toBeVisible();
  await page.goto('/cards/new');
  await page.getByLabel('שם הכרטיס').fill('ויזה');
  await page.getByLabel('4 ספרות אחרונות').fill('4821');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('heading', { name: 'ויזה' })).toBeVisible();

  await page.goto('/import');
  await page.getByLabel('לאן לייבא').selectOption({ label: 'ויזה ·· 4821' });
  await page.getByLabel('קובץ (CSV, XLS, XLSX)').setInputFiles(file);
  await expect(page.getByText('מבנה חדש. בדוק את שיוך העמודות.')).toBeVisible();
  await expect(page.getByText('4 שורות נקראו')).toBeVisible();
  await page.getByRole('button', { name: 'לתצוגה מקדימה' }).click();
  await expect(page.getByText('תשלום 3 מתוך 6')).toBeVisible();

  // Categorize Shufersal and remember it as a rule.
  await page.getByRole('combobox', { name: 'קטגוריה' }).first().selectOption({ label: 'מזון וסופר' });
  await page.getByRole('button', { name: '+ כלל' }).first().click();
  await expect(page.getByText('נוצר כלל')).toBeVisible();

  await page.getByRole('button', { name: 'ייבוא 4 תנועות' }).click();
  await expect(page.getByText('יובאו 4 תנועות')).toBeVisible();

  // Same file again: recognized preset, everything flagged as already imported.
  await page.getByRole('button', { name: 'ייבוא קובץ נוסף' }).click();
  await page.getByLabel('לאן לייבא').selectOption({ label: 'ויזה ·· 4821' });
  await page.getByLabel('קובץ (CSV, XLS, XLSX)').setInputFiles(file);
  await expect(page.getByText(/זוהה מבנה שמור/)).toBeVisible();
  await page.getByRole('button', { name: 'לתצוגה מקדימה' }).click();
  await expect(page.getByText('יובא כבר')).toHaveCount(4);
  await page.getByRole('button', { name: 'ייבוא 0 תנועות' }).click();
  await expect(page.getByText('יובאו 0 תנועות')).toBeVisible();

  await page.goto('/transactions');
  await expect(page.getByText('4 תנועות')).toBeVisible();
  await expect(page.getByRole('link', { name: /שופרסל דיל/ })).toContainText('מזון וסופר');

  // Undo the first import from the history.
  await page.goto('/import');
  page.on('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'ביטול הייבוא' }).last().click();
  await expect(page.getByText('4 תנועות הוסרו')).toBeVisible();
  await page.goto('/transactions');
  await expect(page.getByText('אין תנועות', { exact: true })).toBeVisible();
});
