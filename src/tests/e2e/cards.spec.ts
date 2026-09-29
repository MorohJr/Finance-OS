import { expect, test, type Page } from '@playwright/test';

async function addBank(page: Page) {
  await page.goto('/accounts/new');
  await page.getByLabel('שם החשבון').fill('עו"ש');
  await page.getByLabel('יתרה היום').fill('10,000');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('heading', { name: 'עו"ש' })).toBeVisible();
}

async function addCard(page: Page, kind: 'אשראי (חיוב נדחה)' | 'דביט (חיוב מיידי)', last4: string) {
  await page.goto('/cards/new');
  await page.getByLabel('שם הכרטיס').fill(kind.startsWith('אשראי') ? 'כאל ויזה' : 'דביט לאומי');
  await page.getByLabel('4 ספרות אחרונות').fill(last4);
  await page.getByRole('radio', { name: kind }).click();
  if (kind.startsWith('אשראי')) {
    await page.getByLabel('יום החיוב בחודש').selectOption('10');
    await page.getByLabel('מסגרת אשראי').fill('10,000');
  }
  await page.getByRole('button', { name: 'שמירה' }).click();
}

test('installment purchase on a credit card, then the charge date closes the statement once', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-30T10:00:00+03:00') });
  await addBank(page);
  await addCard(page, 'אשראי (חיוב נדחה)', '4821');
  await expect(page.getByRole('heading', { name: 'כאל ויזה' })).toBeVisible();

  await page.getByRole('link', { name: 'הוספת עסקה' }).click();
  await page.getByLabel('סכום').fill('1,000');
  await page.getByLabel('בית עסק / אדם').fill('KSP');
  await page.getByText('בתשלומים?').click();
  await page.getByLabel('מספר תשלומים').fill('3');
  await expect(page.getByText('₪333.34 ואחר כך 2 × ₪333.33')).toBeVisible();
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByText('התנועה נשמרה')).toBeVisible();

  // Like golden example 14.2: open 333.34, future 666.66, available 9,000.
  await page.goto('/cards');
  await page.goto('/accounts');
  await page.getByRole('link', { name: /כאל ויזה/ }).click();
  const hero = page.locator('section').first();
  await expect(hero).toContainText('₪333.34');
  await expect(hero).toContainText('₪666.66');
  await expect(hero).toContainText('₪9,000.00');

  // The bank is untouched until 10/10.
  await page.goto('/accounts');
  await expect(page.getByRole('link', { name: /^עו"ש/ })).toContainText('₪10,000.00');

  // Jump to the charge date: the statement closes and ONE card_payment is created.
  await page.clock.setFixedTime(new Date('2026-10-10T09:00:00+03:00'));
  await page.reload();
  await expect(page.getByRole('link', { name: /^עו"ש/ })).toContainText('₪9,666.66');
  await page.reload();
  await page.reload();
  await expect(page.getByRole('link', { name: /^עו"ש/ })).toContainText('₪9,666.66');
  await page.goto('/transactions?kind=card_payment');
  await expect(page.getByText('1 תנועות')).toBeVisible();
});

test('debit card purchase comes out of the bank immediately', async ({ page }) => {
  await addBank(page);
  await addCard(page, 'דביט (חיוב מיידי)', '1234');
  await expect(page.getByText('כרטיס דביט: כל עסקה יורדת מיד')).toBeVisible();
  await page.getByRole('link', { name: 'הוספת עסקה' }).click();
  await page.getByLabel('סכום').fill('250');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByText('התנועה נשמרה')).toBeVisible();
  await page.goto('/accounts');
  await expect(page.getByRole('link', { name: /^עו"ש/ })).toContainText('₪9,750.00');
});

test('the card form never accepts more than 4 digits', async ({ page }) => {
  await addBank(page);
  await page.goto('/cards/new');
  await page.getByLabel('4 ספרות אחרונות').fill('4580123412344821');
  await expect(page.getByLabel('4 ספרות אחרונות')).toHaveValue('4580');
});
