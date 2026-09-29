import type { Transaction } from '../../domain/schemas';

const ts = '2026-09-30T09:00:00.000Z';
let seq = 0;

/** Minimal valid transaction for calc tests. */
export function tx(partial: Partial<Transaction> & Pick<Transaction, 'kind' | 'amountAgorot'>): Transaction {
  seq++;
  return {
    id: crypto.randomUUID(),
    createdAt: `2026-09-30T09:00:${String(seq % 60).padStart(2, '0')}.000Z`,
    updatedAt: ts,
    date: '2026-09-15',
    context: 'personal',
    source: 'manual',
    status: 'cleared',
    tags: [],
    attachmentIds: [],
    ...partial,
  };
}

/** ₪ → agorot for readable tests. */
export const ils = (shekels: number) => Math.round(shekels * 100);
