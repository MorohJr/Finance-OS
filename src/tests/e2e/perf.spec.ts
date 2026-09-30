import { expect, test } from '@playwright/test';

test.setTimeout(120_000);

test('10,000 transactions: dashboard, list, search and budget stay fast', async ({ page }) => {
  await page.goto('/accounts/new');
  await page.getByLabel('שם החשבון').fill('עו"ש');
  await page.getByLabel('יתרה היום').fill('100,000');
  await page.getByLabel('נכון לתאריך').fill('2020-01-01');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('heading', { name: 'עו"ש' })).toBeVisible();

  // Insert 10,000 transactions directly into IndexedDB (same shape the app writes).
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('finance-os');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const read = <T,>(store: string): Promise<T[]> =>
      new Promise((res) => {
        const q = db.transaction(store).objectStore(store).getAll();
        q.onsuccess = () => res(q.result as T[]);
      });
    const account = (await read<{ id: string }>('accounts'))[0]!;
    const cats = (await read<{ id: string; type: string; context: string }>('categories')).filter((c) => c.type === 'expense' && c.context === 'personal');
    const tx = db.transaction('transactions', 'readwrite');
    const store = tx.objectStore('transactions');
    const ts = new Date().toISOString();
    for (let i = 0; i < 10_000; i++) {
      const d = new Date(Date.UTC(2021, 0, 1) + i * 5 * 3_600_000 * 4);
      store.put({
        id: crypto.randomUUID(),
        createdAt: ts,
        updatedAt: ts,
        date: d.toISOString().slice(0, 10),
        kind: i % 10 === 0 ? 'income' : 'expense',
        amountAgorot: 1_000 + ((i * 7919) % 50_000),
        accountId: account.id,
        categoryId: i % 10 === 0 ? undefined : cats[i % cats.length]!.id,
        description: `בית עסק ${i % 250}`,
        context: 'personal',
        source: 'import',
        status: 'cleared',
        tags: [],
        attachmentIds: [],
      });
    }
    await new Promise((res) => (tx.oncomplete = res));
  });

  const time = async (label: string, fn: () => Promise<void>) => {
    const t0 = Date.now();
    await fn();
    const ms = Date.now() - t0;
    console.log(`${label}: ${ms}ms`);
    return ms;
  };

  const home = await time('dashboard', async () => {
    await page.goto('/');
    await expect(page.getByText('תנועות אחרונות')).toBeVisible();
    await expect(page.getByRole('link', { name: /כסף בחשבונות/ })).toContainText('₪');
  });
  const list = await time('transactions list', async () => {
    await page.goto('/transactions');
    await expect(page.getByText(/10,001 תנועות/)).toBeVisible();
  });
  const search = await time('search', async () => {
    await page.getByPlaceholder('בית עסק, תיאור, סכום, תגית').fill('בית עסק 42');
    await expect(page.getByText(/^\d+ תנועות$/)).not.toHaveText('10,001 תנועות');
  });
  const budget = await time('budget', async () => {
    await page.goto('/plan/budget?month=2021-06');
    await expect(page.getByText('תקציב החודש')).toBeVisible();
  });
  const reports = await time('reports (year)', async () => {
    await page.goto('/reports?kind=year&from=2021-01-01');
    await expect(page.getByText('הוצאות לפי קטגוריה')).toBeVisible();
  });

  for (const ms of [home, list, search, budget, reports]) expect(ms).toBeLessThan(3_000);
});
