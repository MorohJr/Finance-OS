import { expect, test } from '@playwright/test';

test('payslip: net income arrives on pay day, pension deposit reaches the fund, forecast expects next salary', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-30T10:00:00+03:00') });
  await page.goto('/accounts/new');
  await page.getByLabel('שם החשבון').fill('עו"ש');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('heading', { name: 'עו"ש' })).toBeVisible();

  await page.goto('/pension/new');
  await page.getByLabel('שם', { exact: true }).fill('קרן פנסיה');
  await page.getByLabel('חברה מנהלת').fill('הראל');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('button', { name: 'עדכון יתרה' })).toBeVisible();

  await page.goto('/salary/employer/new');
  await page.getByLabel('שם המעסיק').fill('חברת הייטק');
  await page.getByLabel('קרן לפנסיה מהתלוש').selectOption({ label: 'קרן פנסיה' });
  await page.getByRole('button', { name: 'שמירה' }).click();
  await page.getByRole('link', { name: 'תלוש חדש' }).click();
  await page.getByLabel('חודש', { exact: true }).fill('2026-09');
  await expect(page.getByText('ייכנס לחשבון ב-09/10/2026')).toBeVisible();

  const fill = async (label: string, v: string) => page.getByLabel(label, { exact: true }).fill(v);
  await fill('ברוטו', '15,000');
  await fill('מס הכנסה', '1,500');
  await fill('ביטוח לאומי', '600');
  await fill('מס בריאות', '400');
  await fill('פנסיה עובד', '900');
  await fill('פנסיה מעסיק', '975');
  await fill('פיצויים', '1,250');
  await fill('נטו לתשלום', '11,500');
  await expect(page.getByText(/שונה מהנטו ב-₪100.00/)).toBeVisible();
  await fill('נטו לתשלום', '11,600');
  await expect(page.getByText(/שונה מהנטו/)).toBeHidden();
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('link', { name: /09\/2026/ })).toContainText('₪11,600.00');

  // Pay date in the future: pending, balance unchanged.
  await page.goto('/accounts');
  await expect(page.getByRole('link', { name: /^עו"ש/ })).toContainText('₪0.00');
  // Pay day arrives.
  await page.clock.setFixedTime(new Date('2026-10-09T09:00:00+03:00'));
  await page.goto('/accounts');
  await expect(page.getByRole('link', { name: /^עו"ש/ })).toContainText('₪11,600.00');
  await page.goto('/pension');
  await expect(page.getByRole('link', { name: /קרן פנסיה/ })).toContainText('₪3,125.00'); // 900 + 975 + 1,250

  // Forecast expects the next salary (average of the last payslips) on 09/11.
  await page.goto('/plan/forecast?days=60');
  await expect(page.getByText('09/11/2026')).toBeVisible();
  await expect(page.getByText('משכורת', { exact: true }).first()).toBeVisible();
});

test('➕ offers a payslip; without an employer it asks for one first, then continues to the payslip', async ({ page }) => {
  await page.goto('/accounts/new');
  await page.getByLabel('שם החשבון').fill('עו"ש');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('heading', { name: 'עו"ש' })).toBeVisible();
  await page.getByRole('navigation', { name: 'ניווט ראשי' }).getByRole('button', { name: 'הוספה' }).click();
  await page.getByRole('dialog', { name: 'הוספה מהירה' }).getByRole('button', { name: 'תלוש שכר' }).click();
  await page.getByLabel('שם המעסיק').fill('חברת הייטק');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('heading', { name: 'תלוש חדש' })).toBeVisible();
  await expect(page.getByLabel('מעסיק', { exact: true })).toHaveValue(/.+/);
  // Next time ➕ goes straight to the payslip.
  await page.goto('/');
  await page.getByRole('navigation', { name: 'ניווט ראשי' }).getByRole('button', { name: 'הוספה' }).click();
  await page.getByRole('dialog', { name: 'הוספה מהירה' }).getByRole('button', { name: 'תלוש שכר' }).click();
  await expect(page.getByRole('heading', { name: 'תלוש חדש' })).toBeVisible();
});
