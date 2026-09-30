import { expect, test } from '@playwright/test';

// 1×1 red PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
const file = { name: 'logo.png', mimeType: 'image/png', buffer: PNG };

test('own image for an account without an institution and for a card', async ({ page }) => {
  await page.goto('/accounts/new');
  await page.getByLabel('שם החשבון').fill('PayPal');
  await page.getByLabel('סוג').selectOption({ label: 'פלטפורמה' });
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByRole('button', { name: 'הסרה' })).toBeVisible();
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('heading', { name: 'PayPal' })).toBeVisible();
  await page.goto('/accounts');
  await expect(page.getByRole('link', { name: /PayPal/ }).locator('img')).toBeVisible();

  await page.goto('/cards/new');
  await page.getByLabel('שם הכרטיס').fill('אמקס');
  await page.getByLabel('4 ספרות אחרונות').fill('1234');
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByRole('button', { name: 'הסרה' })).toBeVisible();
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('heading', { name: 'אמקס' })).toBeVisible();
  await page.goto('/accounts');
  await expect(page.getByRole('link', { name: /אמקס/ }).locator('img')).toBeVisible();
});
