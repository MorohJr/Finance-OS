import type { FinanceDB } from '../../db/db';
import type { Account, Card } from '../../domain/schemas';
import { addDays, addMonths, todayIL, withDay } from '../../calc/dates';
import { monthRange, nextMonth } from '../../calc/cashflow';
import { vatPeriodOf } from '../../calc/business/periods';
import { createAccount } from '../accounts';
import { createCard, saveTransactionWithInstallments, syncCardStatements } from '../cards';
import { createTransaction } from '../transactions';
import { createRecurring, markRecurringPaid, setBudgetOverride, setCategoryBudget } from '../recurring';
import { createRule } from '../rules';
import { findOrCreatePayee } from '../payees';
import { createCheck, createLending, createLoan, recordLoanPayment, recordRepayment, setCheckStatus } from '../debts';
import { addDebtCharge, recordDebtPayment, saveDebt } from '../debts2';
import { addSaving, createWish, recordWishPurchase } from '../wish';
import { saveFund, saveSecurity, saveSnapshot, saveTrade, selfDeposit, setFxRate, setPrice } from '../investments';
import { saveEmployer, savePayslip } from '../salary';
import { loadBusinessOverview, markVatPaid, moveToTaxReserve, saveBusiness, saveBusinessExpense, saveBusinessIncome, saveTaxSettings } from '../business';
import { formatScaled, parseScaled } from '../../calc/investments';
import { accountBalance } from '../../calc/balance';

/**
 * Demo data (owner request 01/10/2026): a well-off family, one year back, touching every part of
 * the app. Everything is created through the app's own services, so links and derived values
 * (card statements, installments, loan splits, VAT, pension deltas…) are exactly what real use
 * produces. Deterministic: the same `today` gives the same data.
 */

/** mulberry32: small seeded PRNG so the demo looks the same every time. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Progress = (step: string) => void;

export async function generateDemo(db: FinanceDB, today: string = todayIL(), progress: Progress = () => {}): Promise<void> {
  const rand = rng(20261001);
  /** Random amount in agorot between min and max shekels (with agorot). */
  const amt = (min: number, max: number) => Math.round((min + rand() * (max - min)) * 100);
  /** Round shekels. */
  const ils = (n: number) => Math.round(n * 100);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const start = addMonths(today, -12);
  const openDate = addDays(start, -1);
  const months: string[] = [];
  for (let m = start.slice(0, 7); m <= today.slice(0, 7); m = nextMonth(m)) months.push(m);
  const dayIn = (month: string, day: number) => {
    const d = withDay(`${month}-01`, day);
    return d > today ? undefined : d < start ? undefined : d;
  };

  const categories = await db.categories.toArray();
  const cat = (name: string, type: 'expense' | 'income' = 'expense', context?: string) =>
    categories.find((c) => c.name === name && c.type === type && (!context || c.context === context))?.id;
  const institutions = await db.institutions.toArray();
  const inst = (name: string) => institutions.find((i) => i.name === name)?.id;

  // -------------------------------------------------------------------------
  progress('חשבונות וכרטיסים');
  const acc = async (name: string, kind: Account['kind'], opening: number, institution?: string, context: Account['context'] = 'personal', extra: Partial<Account> = {}) =>
    createAccount(db, { name, kind, context, institutionId: institution ? inst(institution) : undefined, isVisibleOnDashboard: true, ...extra }, opening, openDate);
  const leumi = await acc('עו"ש לאומי', 'bank', ils(84_250.4), 'בנק לאומי', 'personal', { overdraftLimit: ils(40_000), overdraftRatePct: 1150 });
  const bizBank = await acc('עו"ש עסקי דיסקונט', 'bank', ils(41_300), 'בנק דיסקונט', 'business');
  const savings = await acc('חיסכון משפחתי', 'savings', ils(248_000), 'בנק הפועלים');
  const deposit = await acc('פיקדון שקלי 12 חודשים', 'deposit', ils(400_000), 'מזרחי-טפחות');
  const cash = await acc('מזומן', 'cash', ils(1_850));
  const broker = await acc('חשבון מסחר', 'brokerage', ils(185_000), 'הבינלאומי');
  const paypal = await acc('PayPal', 'platform', ils(3_420), 'PayPal');
  const taxBox = await acc('קופת מיסים', 'savings', 0, 'בנק דיסקונט', 'business');

  const card = async (name: string, issuer: string, last4: string, kind: Card['kind'], billing: string, chargeDay: number, limit?: number, context: Card['context'] = 'personal') => {
    const c = await createCard(db, { name, issuerId: inst(issuer)!, last4, kind, billingAccountId: billing, chargeDay, cycleCutoffDay: null, creditLimit: limit, context });
    // Tracked from the start of the demo year, so every statement is charged to the bank.
    await db.cards.update(c.id, { createdAt: `${openDate}T08:00:00.000Z` });
    return (await db.cards.get(c.id))!;
  };
  const visa = await card('כאל ויזה אינפיניטי', 'כאל', '4821', 'credit', leumi.id, 10, ils(60_000));
  const amex = await card('אמריקן אקספרס פלטינום', 'אמריקן אקספרס', '1007', 'credit', leumi.id, 2, ils(45_000));
  const bizCard = await card('מקס ביזנס', 'מקס', '5530', 'credit', bizBank.id, 15, ils(25_000), 'business');
  const debit = await card('דביט לאומי', 'בנק לאומי', '9012', 'debit', leumi.id, 1);

  // -------------------------------------------------------------------------
  progress('כללי קטגוריה ותקציב');
  const rules: [string, string][] = [
    ['שופרסל', 'מזון וסופר'],
    ['רמי לוי', 'מזון וסופר'],
    ['ויקטורי', 'מזון וסופר'],
    ['פז', 'דלק'],
    ['סונול', 'דלק'],
    ['Wolt', 'מסעדות ובתי קפה'],
    ['סופר-פארם', 'בריאות ותרופות'],
    ['Netflix', 'מנויים דיגיטליים'],
  ];
  for (const [pattern, name] of rules) await createRule(db, pattern, cat(name)!);
  const budgets: [string, number][] = [
    ['מזון וסופר', 6_500],
    ['מסעדות ובתי קפה', 3_500],
    ['דלק', 1_400],
    ['ביגוד והנעלה', 2_500],
    ['בילוי ופנאי', 2_000],
    ['ילדים (מעון, צהרון, חוגים)', 5_000],
    ['בריאות ותרופות', 600],
    ['מתנות ואירועים', 1_200],
    ['חופשות', 6_000],
    ['טיפוח', 700],
  ];
  for (const [name, b] of budgets) await setCategoryBudget(db, cat(name)!, ils(b));
  await setBudgetOverride(db, cat('מתנות ואירועים')!, today.slice(0, 7), ils(3_000));

  // -------------------------------------------------------------------------
  progress('משכורת ופנסיה');
  const harel = await saveFund(db, { name: 'הראל פנסיה', productType: 'pension_fund', provider: 'הראל', track: 'מסלול מניות', policyLast4: '3310', feeFromDepositPct: 100, feeFromBalancePct: 18, source: 'employer', isLiquid: false });
  const migdal = await saveFund(db, { name: 'ביטוח מנהלים מגדל', productType: 'managers_insurance', provider: 'מגדל', track: 'כללי', feeFromBalancePct: 55, source: 'private', isLiquid: false });
  const altshuler = await saveFund(db, { name: 'גמל להשקעה אלטשולר', productType: 'investment_provident', provider: 'אלטשולר שחם', track: 'S&P 500', feeFromBalancePct: 60, source: 'private', isLiquid: true });
  const kidSavings = await saveFund(db, { name: 'חיסכון לכל ילד — נועה', productType: 'child_savings', provider: 'מיטב', source: 'private', isLiquid: false });
  const selfFund = await saveFund(db, { name: 'קרן פנסיה לעצמאים', productType: 'pension_fund', provider: 'מנורה מבטחים', source: 'self_employed', isLiquid: false });
  const quarterEnds = months.filter((m) => ['03', '06', '09', '12'].includes(m.slice(5)));
  let balances = { harel: 1_184_000, migdal: 312_000, alt: 96_000, kid: 21_400, self: 48_000 };
  await saveSnapshot(db, { fundId: harel.id, date: openDate, balanceAgorot: ils(balances.harel) });
  await saveSnapshot(db, { fundId: selfFund.id, date: openDate, balanceAgorot: ils(balances.self) });
  for (const [i, m] of quarterEnds.entries()) {
    const d = monthRange(m).to > today ? undefined : monthRange(m).to;
    if (!d) continue;
    balances = { harel: balances.harel * 1.035 + 9_000, migdal: balances.migdal * 1.02, alt: balances.alt * 1.05 + 6_000, kid: balances.kid * 1.02 + 150, self: balances.self * 1.03 };
    await saveSnapshot(db, { fundId: migdal.id, date: d, balanceAgorot: ils(balances.migdal), returnPct: 200 });
    await saveSnapshot(db, { fundId: altshuler.id, date: d, balanceAgorot: ils(balances.alt), returnPct: 500 + i * 40, depositsSelfAgorot: ils(6_000) });
    await saveSnapshot(db, { fundId: kidSavings.id, date: d, balanceAgorot: ils(balances.kid), depositsSelfAgorot: ils(150) });
  }

  const employer = await saveEmployer(db, { name: 'טק-גלובל בע"מ', employerVatId: '514998877', startDate: '2019-03-01', payDay: 9, depositAccountId: leumi.id, pensionFundId: harel.id });
  for (const m of months) {
    const month = addMonths(`${m}-01`, -1).slice(0, 7); // paid on the 9th of the next month
    if (`${month}-01` < addMonths(start, -1)) continue;
    const bonus = month.endsWith('-12') ? 45_000 : month.endsWith('-06') ? 3_200 : 0; // year-end bonus, recreation pay
    const gross = 62_000 + bonus;
    const incomeTax = Math.round(gross * 0.3);
    const ni = 4_950;
    const health = 3_200;
    const pensionEmployee = 3_720;
    await savePayslip(
      db,
      {
        employerId: employer.id,
        month,
        grossAgorot: ils(gross),
        incomeTaxAgorot: ils(incomeTax),
        nationalInsuranceAgorot: ils(ni),
        healthTaxAgorot: ils(health),
        pensionEmployeeAgorot: ils(pensionEmployee),
        pensionEmployerAgorot: ils(4_030),
        severanceAgorot: ils(5_165),
        otherDeductionsAgorot: ils(1_150),
        netAgorot: ils(gross - incomeTax - ni - health - pensionEmployee - 1_150),
        components: bonus ? [{ kind: month.endsWith('-12') ? 'bonus' : 'recreation', amountAgorot: ils(bonus) }] : undefined,
      },
      undefined,
      today,
    );
  }

  // -------------------------------------------------------------------------
  progress('חשבונות קבועים ומנויים');
  const rec = async (input: Parameters<typeof createRecurring>[1], usage?: [number, number]) => {
    const r = await createRecurring(db, input);
    let next = r.nextDueDate;
    let guard = 0;
    while (next <= today && guard++ < 400) {
      await markRecurringPaid(db, r.id, usage ? { amountAgorot: amt(usage[0], usage[1]) } : {});
      next = (await db.recurring.get(r.id))!.nextDueDate;
      // usage_based items don't advance on their own (SPEC 10.4: the user sets the next date).
      if (usage) {
        next = addMonths(next, 1, r.anchorDay);
        await db.recurring.update(r.id, { nextDueDate: next });
      }
    }
    return r;
  };
  const base = { status: 'active' as const, autoCreate: false };
  await rec({ ...base, name: 'ארנונה', kind: 'bill', amountAgorot: ils(1_420), frequency: 'bimonthly', nextDueDate: withDay(start, 1), accountId: leumi.id, categoryId: cat('ארנונה'), paymentMethod: 'standing_order', reminderDaysBefore: 3 });
  await rec({ ...base, name: 'חשמל', kind: 'bill', frequency: 'usage_based', nextDueDate: withDay(start, 20), accountId: leumi.id, categoryId: cat('חשמל'), provider: 'חברת החשמל' }, [650, 1_400]);
  await rec({ ...base, name: 'מים', kind: 'bill', amountAgorot: ils(310), frequency: 'bimonthly', nextDueDate: withDay(start, 12), accountId: leumi.id, categoryId: cat('מים') });
  await rec({ ...base, name: 'ועד בית', kind: 'bill', amountAgorot: ils(480), frequency: 'monthly', nextDueDate: withDay(start, 5), accountId: leumi.id, categoryId: cat('ועד בית') });
  await rec({ ...base, name: 'גן + צהרון', kind: 'bill', amountAgorot: ils(4_150), frequency: 'monthly', nextDueDate: withDay(start, 3), accountId: leumi.id, categoryId: cat('ילדים (מעון, צהרון, חוגים)') });
  await rec({ ...base, name: 'ביטוח בריאות משפחתי', kind: 'bill', amountAgorot: ils(612), frequency: 'monthly', nextDueDate: withDay(start, 7), cardId: visa.id, categoryId: cat('קופת חולים וביטוח משלים') });
  await rec({ ...base, name: 'סלולר ×4', kind: 'bill', amountAgorot: ils(196), frequency: 'monthly', nextDueDate: withDay(start, 14), cardId: visa.id, categoryId: cat('תקשורת (סלולר, אינטרנט, טלוויזיה)'), commitmentEndDate: addMonths(today, 2), provider: 'פרטנר' });
  await rec({ ...base, name: 'אינטרנט סיבים', kind: 'bill', amountAgorot: ils(129), frequency: 'monthly', nextDueDate: withDay(start, 16), cardId: visa.id, categoryId: cat('תקשורת (סלולר, אינטרנט, טלוויזיה)') });
  await rec({ ...base, name: 'Netflix', kind: 'subscription', amountAgorot: ils(69.9), frequency: 'monthly', nextDueDate: withDay(start, 11), cardId: amex.id, categoryId: cat('מנויים דיגיטליים') });
  await rec({ ...base, name: 'Spotify משפחתי', kind: 'subscription', amountAgorot: ils(37.9), frequency: 'monthly', nextDueDate: withDay(start, 18), cardId: amex.id, categoryId: cat('מנויים דיגיטליים') });
  await rec({ ...base, name: 'iCloud 2TB', kind: 'subscription', amountAgorot: ils(39.9), frequency: 'monthly', nextDueDate: withDay(start, 22), cardId: amex.id, categoryId: cat('מנויים דיגיטליים') });
  await rec({ ...base, name: 'מנוי חדר כושר', kind: 'subscription', amountAgorot: ils(3_600), frequency: 'yearly', nextDueDate: addDays(start, 40), cardId: visa.id, categoryId: cat('בילוי ופנאי'), renewalDate: addDays(addMonths(start, 12), 40) });
  await rec({ ...base, name: 'ביטוח רכב מקיף', kind: 'bill', amountAgorot: ils(7_240), frequency: 'yearly', nextDueDate: addDays(start, 75), cardId: visa.id, categoryId: cat('רכב (ביטוח, טיפולים, אגרה)'), renewalDate: addDays(addMonths(start, 12), 75) });
  await rec({ ...base, name: 'שכר דירה מדירה להשקעה', kind: 'income', amountAgorot: ils(7_800), frequency: 'monthly', nextDueDate: withDay(start, 1), accountId: leumi.id, categoryId: cat('שונות', 'income'), linkedToCPI: true });
  await rec({ ...base, name: 'הוראת קבע לחיסכון', kind: 'transfer', amountAgorot: ils(5_000), frequency: 'monthly', nextDueDate: withDay(start, 10), accountId: leumi.id, toAccountId: savings.id, paymentMethod: 'standing_order' });
  // A trial ending soon, and one auto-created charge waiting for confirmation.
  await createRecurring(db, { name: 'Disney+ (ניסיון)', kind: 'subscription', amountAgorot: ils(39.9), frequency: 'monthly', nextDueDate: addDays(today, 9), status: 'trial', trialEndDate: addDays(today, 9), cardId: amex.id, categoryId: cat('מנויים דיגיטליים'), autoCreate: false });
  await createRecurring(db, { name: 'עמלת ניהול חשבון', kind: 'bill', amountAgorot: ils(24.9), frequency: 'monthly', nextDueDate: addDays(today, -2), status: 'active', accountId: leumi.id, categoryId: cat('עמלות בנק'), autoCreate: true });

  // -------------------------------------------------------------------------
  progress('הוצאות יומיומיות');
  const buy = async (date: string, source: { cardId?: string; accountId?: string }, amount: number, payee: string, category?: string, extra: { tags?: string[]; note?: string; context?: 'personal' | 'business' } = {}) => {
    const p = await findOrCreatePayee(db, payee, category ? cat(category) : undefined);
    return saveTransactionWithInstallments(db, undefined, {
      kind: 'expense',
      amountAgorot: amount,
      date,
      ...source,
      categoryId: category ? cat(category) : undefined,
      payeeId: p.id,
      context: extra.context ?? 'personal',
      status: 'cleared',
      tags: extra.tags,
      note: extra.note,
      paymentMethod: source.cardId ? 'card' : undefined,
    });
  };
  const grocers = ['שופרסל דיל', 'רמי לוי', 'ויקטורי', 'יוחננוף', 'AM:PM'];
  const restaurants = ['Wolt', 'מסעדת הדסון', 'קפה לנדוור', 'ג׳פניקה', 'מרי פוסה', 'ארומה'];
  const shops = ['זארה', 'H&M', 'נייקי', 'טרמינל X', 'קסטרו', 'ASOS'];
  for (const m of months) {
    for (let week = 0; week < 5; week++) {
      const d = dayIn(m, 2 + week * 6 + Math.floor(rand() * 4));
      if (d) await buy(d, { cardId: rand() < 0.75 ? visa.id : debit.id }, amt(780, 1_650), pick(grocers), 'מזון וסופר');
    }
    for (let i = 0; i < 5; i++) {
      const d = dayIn(m, 1 + Math.floor(rand() * 27));
      if (d) await buy(d, { cardId: amex.id }, amt(90, 820), pick(restaurants), 'מסעדות ובתי קפה');
    }
    for (const day of [6, 21]) {
      const d = dayIn(m, day);
      if (d) await buy(d, { cardId: visa.id }, amt(380, 520), pick(['פז יילו', 'סונול', 'דלק']), 'דלק');
    }
    const shopDay = dayIn(m, 13 + Math.floor(rand() * 10));
    if (shopDay) await buy(shopDay, { cardId: amex.id }, amt(450, 2_900), pick(shops), 'ביגוד והנעלה');
    const pharm = dayIn(m, 9);
    if (pharm) await buy(pharm, { cardId: visa.id }, amt(80, 420), 'סופר-פארם', 'בריאות ותרופות');
    const fun = dayIn(m, 17);
    if (fun) await buy(fun, { cardId: amex.id }, amt(250, 1_300), pick(['סינמה סיטי', 'הופעה בהיכל', 'פארק המים', 'בריכת ספורטן']), 'בילוי ופנאי');
    const kids = dayIn(m, 4);
    if (kids) await buy(kids, { accountId: leumi.id }, ils(950), 'חוג כדורסל + ציור', 'ילדים (מעון, צהרון, חוגים)');
    const beauty = dayIn(m, 26);
    if (beauty) await buy(beauty, { cardId: visa.id }, amt(180, 650), pick(['מספרה', 'קוסמטיקאית']), 'טיפוח');
    const pet = dayIn(m, 15);
    if (pet) await buy(pet, { cardId: visa.id }, amt(160, 420), 'פט-שופ', 'חיות מחמד');
    const cashDay = dayIn(m, 11);
    if (cashDay) await buy(cashDay, { accountId: cash.id }, amt(40, 220), pick(['שוק הכרמל', 'פיצוציה', 'חניון']), pick(['מזון וסופר', 'חניה', 'שונות']));
    const cashTopUp = dayIn(m, 10);
    if (cashTopUp) await createTransaction(db, { kind: 'transfer', amountAgorot: ils(500), date: cashTopUp, accountId: leumi.id, toAccountId: cash.id, context: 'personal', status: 'cleared', description: 'משיכת מזומן' });
    const donation = dayIn(m, 28);
    if (donation) await buy(donation, { accountId: leumi.id }, ils(250), 'לתת', 'תרומות', { note: 'הוראה חודשית, זיכוי מס 35%' });
    const paypalBuy = dayIn(m, 19);
    if (paypalBuy && rand() < 0.5) await buy(paypalBuy, { accountId: paypal.id }, amt(60, 400), pick(['AliExpress', 'Etsy', 'eBay']), 'בית ותחזוקה');
  }
  // Holidays and gifts.
  const gift = dayIn(months[3]!, 24);
  if (gift) await buy(gift, { cardId: amex.id }, ils(1_800), 'מתנה לחתונה', 'מתנות ואירועים', { tags: ['חתונה'] });
  const holiday = dayIn(months[6]!, 8);
  if (holiday) await buy(holiday, { accountId: leumi.id }, ils(2_400), 'סל פסח ומתנות', 'חגים');
  // A refund on the card, and a documented adjustment.
  const refundDay = dayIn(months[5]!, 18);
  if (refundDay) await saveTransactionWithInstallments(db, undefined, { kind: 'refund', amountAgorot: ils(649.9), date: refundDay, cardId: amex.id, categoryId: cat('ביגוד והנעלה'), payeeId: (await findOrCreatePayee(db, 'זארה')).id, context: 'personal', status: 'cleared', note: 'החזרת מעיל' });
  // Quarterly interest on the fixed deposit.
  for (const m of months.filter((_, i) => i % 3 === 2)) {
    const d = dayIn(m, 1);
    if (d) await createTransaction(db, { kind: 'income', amountAgorot: ils(3_950), date: d, accountId: deposit.id, categoryId: cat('ריבית', 'income'), context: 'personal', status: 'cleared', description: 'ריבית פיקדון' });
  }
  const adjDay = dayIn(months[8]!, 2);
  if (adjDay) await createTransaction(db, { kind: 'adjustment', direction: 'out', amountAgorot: ils(37.5), date: adjDay, accountId: cash.id, context: 'personal', status: 'cleared', note: 'ספירת מזומן: פער מול הרשום' });

  // -------------------------------------------------------------------------
  progress('עסקאות בתשלומים ו-Wish List');
  const trip1 = dayIn(months[2]!, 14);
  if (trip1) await saveTransactionWithInstallments(db, undefined, { kind: 'expense', amountAgorot: ils(18_600), date: trip1, cardId: visa.id, categoryId: cat('חופשות'), payeeId: (await findOrCreatePayee(db, 'איסתא')).id, context: 'personal', status: 'cleared', tags: ['יוון'] }, { count: 6, kind: 'installments', budgetRecognition: 'spread' });
  const sofa = dayIn(months[4]!, 3);
  if (sofa) await saveTransactionWithInstallments(db, undefined, { kind: 'expense', amountAgorot: ils(14_900), date: sofa, cardId: amex.id, categoryId: cat('בית ותחזוקה'), payeeId: (await findOrCreatePayee(db, 'ביתילי')).id, context: 'personal', status: 'cleared' }, { count: 12, kind: 'credit', interestTotalAgorot: ils(890), budgetRecognition: 'upfront' });
  const trip2 = dayIn(months[10]!, 1);
  if (trip2) await saveTransactionWithInstallments(db, undefined, { kind: 'expense', amountAgorot: ils(26_400), date: trip2, cardId: visa.id, categoryId: cat('חופשות'), payeeId: (await findOrCreatePayee(db, 'אל על')).id, context: 'personal', status: 'cleared', tags: ['יפן'] }, { count: 10, kind: 'installments', budgetRecognition: 'spread' });

  const car = await createWish(db, { name: 'רכב חשמלי', priceAgorot: ils(245_000), category: 'automotive', priority: 'high', status: 'active', fundingMethod: 'saving', startMonth: months[0], goalMonth: addMonths(today, 10).slice(0, 7), savingsAccountId: savings.id, store: 'Tesla', link: 'https://www.tesla.com/he_il' });
  const japan = await createWish(db, { name: 'טיול משפחתי לניו זילנד', priceAgorot: ils(62_000), category: 'sports_outdoors', priority: 'medium', status: 'active', fundingMethod: 'saving', startMonth: months[2], goalMonth: addMonths(today, 14).slice(0, 7), savingsAccountId: savings.id });
  const mac = await createWish(db, { name: 'MacBook Pro 16', priceAgorot: ils(14_990), category: 'electronics', priority: 'must', status: 'active', fundingMethod: 'installments', startMonth: months[7], goalMonth: months[7], store: 'iDigital' });
  await createWish(db, { name: 'פסנתר חשמלי', priceAgorot: ils(8_900), category: 'musical_instruments', priority: 'low', status: 'paused', fundingMethod: 'saving', savingsAccountId: savings.id });
  for (const m of months) {
    const d = dayIn(m, 12);
    if (d) {
      await addSaving(db, car.id, leumi.id, ils(9_000), d);
      if (m >= months[2]!) await addSaving(db, japan.id, leumi.id, ils(2_500), d);
    }
  }
  const macDay = dayIn(months[7]!, 20);
  if (macDay) await recordWishPurchase(db, mac.id, { cardId: amex.id }, ils(14_990), macDay, { count: 10, kind: 'installments', budgetRecognition: 'spread' });
  await db.wishItems.update(mac.id, { status: 'done' });

  // -------------------------------------------------------------------------
  progress('הלוואות, חובות וצ׳קים');
  const carLoanStart = withDay(addMonths(start, 1), 1);
  const carLoan = await createLoan(db, { name: 'הלוואה לרכב משפחתי', lenderType: 'bank', principalAgorot: ils(120_000), rateType: 'annual', ratePct: 490, termMonths: 60, amortization: 'spitzer', startDate: carLoanStart, firstPaymentDate: withDay(addMonths(carLoanStart, 1), 15), feesAgorot: ils(450), accountId: leumi.id, receivedToAccountId: leumi.id });
  for (let i = 0; i < 12; i++) {
    const due = withDay(addMonths(carLoanStart, i + 1), 15);
    if (due > today) break;
    await recordLoanPayment(db, carLoan.id, { date: due });
  }
  const renoStart = withDay(addMonths(start, 3), 5);
  const reno = await createLoan(db, { name: 'הלוואה לשיפוץ (קבוע לפי סך ריבית)', lenderType: 'card_company', principalAgorot: ils(30_000), rateType: 'total', ratePct: 700, termMonths: 24, amortization: 'flat', startDate: renoStart, firstPaymentDate: withDay(addMonths(renoStart, 1), 10), accountId: leumi.id, receivedToAccountId: leumi.id });
  for (let i = 0; i < 12; i++) {
    const due = withDay(addMonths(renoStart, i + 1), 10);
    if (due > today) break;
    await recordLoanPayment(db, reno.id, { date: due });
  }
  const discountStart = addDays(today, -40);
  await createLoan(db, { name: "ניכיון צ'קים מלקוח", lenderType: 'check_discounting', principalAgorot: ils(24_000), rateType: 'total', ratePct: 180, termMonths: 3, amortization: 'bullet', startDate: discountStart, firstPaymentDate: addDays(discountStart, 90), feesAgorot: ils(120), accountId: bizBank.id, receivedToAccountId: bizBank.id });

  const brother = await createLending(db, { borrowerName: 'יואב (אח)', principalAgorot: ils(20_000), ratePct: 500, date: withDay(addMonths(start, 2), 3), fromAccountId: savings.id, expectedEndDate: addMonths(today, 4), note: 'לדירה הראשונה' });
  for (const k of [4, 6, 8, 10]) {
    const d = dayIn(months[k]!, 5);
    if (d) await recordRepayment(db, brother.id, ils(5_000), leumi.id, d);
  }

  const settlementStart = withDay(addMonths(today, -6), 1);
  const collection = await saveDebt(db, { creditor: 'הוצאה לפועל — חברת ליסינג', kind: 'legal_settlement', originalAmountAgorot: ils(18_000), date: addMonths(settlementStart, -1), status: 'arrangement', monthlyPaymentAgorot: ils(1_500), paymentDay: 10, planStartDate: settlementStart, accountId: leumi.id, categoryId: cat('רכב (ביטוח, טיפולים, אגרה)'), caseNumber: '02-45871-25-6', context: 'personal', note: 'מחלוקת על החזרת רכב ליסינג; הוסדר בתשלומים' });
  await addDebtCharge(db, collection.id, { date: addMonths(settlementStart, -1), kind: 'legal', amountAgorot: ils(950), note: 'שכר טרחת עו"ד' });
  for (let i = 0; i < 6; i++) {
    const d = withDay(addMonths(settlementStart, i), 10);
    if (d <= today && i !== 4) await recordDebtPayment(db, collection.id, ils(1_500), leumi.id, d); // one missed payment
  }
  const parking = await saveDebt(db, { creditor: 'עיריית תל אביב — חניה', kind: 'fine', originalAmountAgorot: ils(250), date: addDays(today, -50), status: 'open', accountId: leumi.id, categoryId: cat('מיסים ואגרות'), caseNumber: '88120455', context: 'personal' });
  await addDebtCharge(db, parking.id, { date: addDays(today, -10), kind: 'fine', amountAgorot: ils(125), note: 'תוספת פיגור' });
  const iec = await saveDebt(db, { creditor: 'חברת החשמל — דירה להשקעה', kind: 'utility', originalAmountAgorot: ils(2_340), date: addMonths(today, -4), status: 'open', accountId: leumi.id, categoryId: cat('חשמל'), context: 'personal', note: 'חשבון שנשאר מהשוכר הקודם' });
  await addDebtCharge(db, iec.id, { date: addMonths(today, -2), kind: 'interest', amountAgorot: ils(86) });
  await recordDebtPayment(db, iec.id, ils(2_426), leumi.id, addMonths(today, -1));

  const check = async (direction: 'issued' | 'received', number: string, amount: number, issue: string, due: string, counterparty: string, status: 'pending' | 'cleared' | 'bounced', account: string, category?: string, context: 'personal' | 'business' = 'personal') => {
    const c = await createCheck(db, { direction, number, amountAgorot: ils(amount), issueDate: issue, dueDate: due, counterparty, accountId: account, status: 'pending', categoryId: category ? cat(category, direction === 'issued' ? 'expense' : 'income') : undefined, context, bankName: direction === 'received' ? 'בנק הפועלים' : undefined, branch: direction === 'received' ? '532' : undefined });
    if (status !== 'pending') await setCheckStatus(db, c.id, status);
  };
  // Post-dated rent checks from the tenant: two already cleared, two still in the future.
  for (const [i, k] of [-2, -1, 1, 2].entries()) {
    const due = withDay(addMonths(today, k), 1);
    await check('received', String(40_001 + i), 7_800, addMonths(today, -3), due, 'דייר — רחוב הרצל 12', due <= today ? 'cleared' : 'pending', leumi.id, 'שונות');
  }
  await check('issued', '1204', 12_500, addMonths(today, -5), addMonths(today, -4), 'קבלן שיפוצים', 'cleared', leumi.id, 'בית ותחזוקה');
  await check('issued', '1205', 12_500, addMonths(today, -5), addDays(today, 20), 'קבלן שיפוצים', 'pending', leumi.id, 'בית ותחזוקה');
  await check('received', '7781', 3_200, addMonths(today, -2), addMonths(today, -1), 'לקוח — סטודיו עיצוב', 'bounced', bizBank.id, undefined, 'business');

  // -------------------------------------------------------------------------
  progress('עסק: הכנסות, הוצאות ומע"מ');
  // The seeded version starts on 1/1 of the current year; the demo year starts earlier.
  await db.taxSettings.toCollection().modify({ effectiveFrom: openDate, year: Number(openDate.slice(0, 4)) });
  await saveTaxSettings(db, { vatRateBp: 1800, incomeTaxRateBp: 4700, nationalInsuranceRateBp: null, nationalInsuranceMode: 'fixed_monthly', nationalInsuranceMonthlyAgorot: ils(2_240), reserveBasis: 'net_income', capitalGainsRateBp: 2500, paturCeilingAgorot: ils(122_833), pensionAvgWageAgorot: ils(13_769), pensionLowRateBp: 445, pensionHighRateBp: 1255, vatDueDay: 15 }, openDate);
  await saveBusiness(db, { name: 'דניאל כהן — ייעוץ טכנולוגי', vatStatus: 'licensed', openDate: '2021-01-01', vatReportingPeriod: 'bimonthly', businessAccountId: bizBank.id, taxReserveAccountId: taxBox.id });
  const clients = ['בנק דיסקונט — פרויקט ענן', 'סטארטאפ Nova', 'משרד רואי חשבון גל', 'Fintech IL', 'עיריית רמת גן'];
  const classOf = async (prefix: string) => (await db.expenseClasses.filter((c) => c.name.startsWith(prefix)).first())!.id;
  const software = await classOf('תוכנות');
  const phone = await classOf('טלפון');
  const carCls = await classOf('רכב פרטי');
  const accountant = await classOf('שירותי הנהלת');
  const courses = await classOf('קורסים');
  const office = await classOf('ציוד משרדי');
  const ads = await classOf('פרסום');
  for (const [i, m] of months.entries()) {
    for (let k = 0; k < 2 + (i % 2); k++) {
      const d = dayIn(m, 3 + k * 9 + Math.floor(rand() * 5));
      if (!d) continue;
      const net = amt(6_000, 28_000);
      const future = addDays(d, 30) > today;
      const { preview } = await saveBusinessIncome(db, { amountAgorot: net, mode: 'excl_vat', date: d, accountId: bizBank.id, payeeName: pick(clients), received: !future || rand() < 0.4, note: `חשבונית ${2_000 + i * 3 + k}` });
      if (rand() < 0.5 && !future) await moveToTaxReserve(db, bizBank.id, preview.incomeTaxReserve, d);
    }
    const e = async (day: number, amount: number, cls: string, supplier: string, cardSource = false) => {
      const d = dayIn(m, day);
      if (d) await saveBusinessExpense(db, { amountAgorot: amount, expenseClassId: cls, date: d, accountId: cardSource ? undefined : bizBank.id, cardId: cardSource ? bizCard.id : undefined, payeeName: supplier, supplierInvoiceNumber: String(10_000 + Math.floor(rand() * 89_999)) });
    };
    await e(2, ils(420), software, 'Google Workspace + GitHub', true);
    await e(8, ils(149), phone, 'סלקום עסקי', true);
    await e(16, amt(450, 650), carCls, 'פז', true);
    if (i % 3 === 0) await e(20, ils(1_770), accountant, 'משרד רו"ח לוי');
    if (i % 4 === 1) await e(24, amt(900, 2_400), courses, 'קורס AWS');
    if (i % 5 === 2) await e(12, amt(200, 700), office, 'אופיס דיפו', true);
    if (i % 6 === 3) await e(26, ils(2_950), ads, 'LinkedIn Ads', true);
    // Advances to the tax authority and NI, from the business account.
    const adv = dayIn(m, 15);
    if (adv) {
      await createTransaction(db, { kind: 'expense', amountAgorot: ils(6_800), date: adv, accountId: bizBank.id, categoryId: cat('מקדמות מס הכנסה', 'expense', 'business'), context: 'business', status: 'cleared', source: 'manual', paymentMethod: 'standing_order' });
      await createTransaction(db, { kind: 'expense', amountAgorot: ils(2_240), date: adv, accountId: bizBank.id, categoryId: cat('מקדמות ביטוח לאומי', 'expense', 'business'), context: 'business', status: 'cleared', source: 'manual', paymentMethod: 'standing_order' });
    }
  }
  // Pay every VAT period whose due date has passed.
  const overview = await loadBusinessOverview(db, today);
  const vatPeriods = new Set<string>();
  for (const m of months) vatPeriods.add(vatPeriodOf(`${m}-01`, 'bimonthly', 15).key);
  for (const key of vatPeriods) {
    const p = vatPeriodOf(`${key}-01`, 'bimonthly', 15);
    if (p.dueDate > today) continue;
    const r = overview?.vatReports.find((x) => x.key === key);
    const o = r ?? (await loadBusinessOverview(db, p.to))?.vatReports.find((x) => x.key === key);
    if (o && o.vatDue !== 0) await markVatPaid(db, key, o.vatDue, bizBank.id, p.dueDate);
  }
  for (const m of months.filter((_, i) => i % 3 === 1)) {
    const d = dayIn(m, 20);
    if (d) await selfDeposit(db, selfFund.id, bizBank.id, ils(3_500), d);
  }
  // Owner's draw: business → personal.
  for (const m of months) {
    const d = dayIn(m, 28);
    if (d) await createTransaction(db, { kind: 'transfer', amountAgorot: ils(15_000), date: d, accountId: bizBank.id, toAccountId: leumi.id, context: 'business', status: 'cleared', description: 'משיכת בעלים' });
  }

  // -------------------------------------------------------------------------
  progress('השקעות');
  const sectors = await db.sectors.toArray();
  const sector = (name: string) => sectors.find((s) => s.name === name)?.id;
  const sec = async (symbol: string, name: string, exchange: 'TASE' | 'NASDAQ' | 'NYSE', type: 'stock' | 'etf' | 'mutual_fund' | 'bond', priceUnit: 'ILS' | 'ILA' | 'USD', sectorName: string) =>
    saveSecurity(db, { symbol, name, exchange, type, priceUnit, sectorId: sector(sectorName) });
  const holdings = [
    { s: await sec('TA35', 'הראל סל ת"א 35', 'TASE', 'etf', 'ILA', 'קרנות מחקות מדד'), p0: 2_310, drift: 0.012 },
    { s: await sec('SPY', 'SPDR S&P 500', 'NYSE', 'etf', 'USD', 'קרנות מחקות מדד'), p0: 548, drift: 0.013 },
    { s: await sec('AAPL', 'Apple', 'NASDAQ', 'stock', 'USD', 'טכנולוגיית מידע'), p0: 214, drift: 0.01 },
    { s: await sec('NVDA', 'NVIDIA', 'NASDAQ', 'stock', 'USD', 'טכנולוגיית מידע'), p0: 118, drift: 0.03 },
    { s: await sec('LUMI', 'בנק לאומי', 'TASE', 'stock', 'ILA', 'פיננסים'), p0: 3_950, drift: 0.02 },
    { s: await sec('ICL', 'כיל', 'TASE', 'stock', 'ILA', 'חומרים'), p0: 1_690, drift: -0.004 },
    { s: await sec('TLVGOV', 'תכלית אג"ח ממשלתי', 'TASE', 'bond', 'ILA', 'אג"ח'), p0: 36_400, drift: 0.002 },
    { s: await sec('MTF-5112', 'קרן נאמנות מיטב מניות חו"ל', 'TASE', 'mutual_fund', 'ILS', 'קרנות מחקות מדד'), p0: 184.6, drift: 0.009 },
  ];
  let fx = 3.71;
  const priceAt: number[] = holdings.map((h) => h.p0);
  /** Quote per holding per month (for realistic trade prices) and the FX per month. */
  const history: number[][] = holdings.map(() => []);
  const fxHistory: number[] = [];
  const toAgorot = (price: number, unit: string) => (unit === 'ILA' ? Math.round(price * 100) : Math.round(price * 100));
  for (const [i, m] of months.entries()) {
    const d = dayIn(m, 27) ?? (i === months.length - 1 ? today : undefined);
    fx = Math.max(3.4, Math.min(3.95, fx + (rand() - 0.55) * 0.05));
    if (d) await setFxRate(db, fx.toFixed(4), d);
    fxHistory.push(fx);
    for (const [j, h] of holdings.entries()) {
      priceAt[j] = priceAt[j]! * (1 + h.drift + (rand() - 0.5) * 0.06);
      history[j]!.push(priceAt[j]!);
      if (d) await setPrice(db, h.s.id, toAgorot(priceAt[j]!, h.s.priceUnit), d);
    }
  }
  // Buys spread over the year, a sell with a gain, dividends, a split, an account fee.
  const trade = async (hIndex: number, type: 'buy' | 'sell' | 'dividend' | 'split' | 'fee', date: string, qty?: string, gross?: number, fee?: number, tax?: number, mi?: number) => {
    const h = holdings[hIndex]!;
    const usd = h.s.priceUnit === 'USD';
    await saveTrade(db, { brokerageAccountId: broker.id, securityId: h.s.id, type, date, quantity: qty, grossAgorot: gross ?? 0, feeAgorot: fee, taxWithheldAgorot: tax, fxRate: usd ? fxHistory[mi ?? 0]!.toFixed(4) : undefined });
  };
  /** Trade value in agorot at that month's quote (demo generation only; the app itself never does float money). */
  const grossOf = (hIndex: number, qty: number, mi: number) => {
    const h = holdings[hIndex]!;
    const p = history[hIndex]![mi]!;
    const perUnitIls = h.s.priceUnit === 'ILA' ? p / 100 : h.s.priceUnit === 'USD' ? p * fxHistory[mi]! : p;
    return Math.round(qty * perUnitIls * 100);
  };
  const buys: [number, number, number][] = [
    [0, 900, 0],
    [1, 40, 0],
    [2, 60, 1],
    [3, 120, 2],
    [4, 700, 3],
    [5, 1_000, 3],
    [6, 45, 4],
    [7, 90, 5],
    [1, 20, 7],
    [3, 80, 8],
    [0, 400, 9],
  ];
  for (const [hi, qty, mi] of buys) {
    const d = dayIn(months[mi]!, 7);
    if (!d) continue;
    const gross = grossOf(hi, qty, mi);
    const fee = holdings[hi]!.s.priceUnit === 'USD' ? ils(7.5) : Math.round(gross * 0.0008);
    // Like a real investor: move money from savings first when the trading account is short.
    const cashNow = accountBalance(broker.id, await db.transactions.toArray());
    const short = gross + fee + ils(5_000) - cashNow;
    if (short > 0) {
      const topUp = Math.ceil(short / ils(10_000)) * ils(10_000);
      await createTransaction(db, { kind: 'transfer', amountAgorot: topUp, date: addDays(d, -2), accountId: savings.id, toAccountId: broker.id, context: 'personal', status: 'cleared', description: 'העברה לחשבון המסחר' });
    }
    await trade(hi, 'buy', d, String(qty), gross, fee, undefined, mi);
  }
  const sellDay = dayIn(months[10]!, 14);
  if (sellDay) await trade(5, 'sell', sellDay, '600', grossOf(5, 600, 10), ils(18), ils(90), 10);
  for (const [hi, mi, g] of [
    [4, 3, 1_250],
    [4, 9, 1_380],
    [1, 2, 410],
    [1, 5, 425],
    [1, 8, 431],
    [1, 11, 440],
    [2, 4, 180],
    [2, 10, 190],
  ] as const) {
    const d = dayIn(months[mi]!, 20);
    if (d) await trade(hi, 'dividend', d, undefined, ils(g), undefined, ils(g * 0.25), mi);
  }
  const splitDay = dayIn(months[6]!, 11);
  if (splitDay) {
    const held = (await db.investmentTrades.filter((t) => t.securityId === holdings[3]!.s.id && t.type === 'buy' && t.date <= splitDay).toArray()).reduce((a, t) => a + parseScaled(t.quantity), 0n);
    if (held > 0n) {
      // 2:1 split: units double, so every later quote halves.
      await trade(3, 'split', splitDay, formatScaled(held), 0, undefined, undefined, 6);
      const later = await db.pricePoints.filter((pp) => pp.securityId === holdings[3]!.s.id && pp.date >= splitDay).toArray();
      for (const pp of later) await db.pricePoints.update(pp.id, { priceAgorot: Math.round(pp.priceAgorot / 2) });
    }
  }
  for (const mi of [2, 5, 8, 11]) {
    const d = dayIn(months[mi]!, 1);
    if (d) await trade(0, 'fee', d, undefined, ils(45));
  }

  // -------------------------------------------------------------------------
  progress('חיובי כרטיסים');
  await syncCardStatements(db, today);
}
