/**
 * Seed data from SPEC appendices A, B, C. These are the user's initial data (stored in the DB and editable),
 * not UI strings, so they live here rather than in strings.he.ts.
 * Brand colors are approximate and used only for monograms; no brand logos are bundled (SPEC 8).
 */

export interface SeedInstitution {
  name: string;
  kind: 'bank' | 'card_issuer' | 'pension_provider' | 'broker' | 'other';
  code?: string;
  color: string;
}

// Appendix A
export const INSTITUTIONS: SeedInstitution[] = [
  { name: 'בנק הפועלים', kind: 'bank', code: '12', color: '#D5242C' },
  { name: 'בנק לאומי', kind: 'bank', code: '10', color: '#0B4EA2' },
  { name: 'בנק דיסקונט', kind: 'bank', code: '11', color: '#0B7A3E' },
  { name: 'מזרחי-טפחות', kind: 'bank', code: '20', color: '#F37021' },
  { name: 'הבינלאומי', kind: 'bank', code: '31', color: '#005DAA' },
  { name: 'בנק מרכנתיל', kind: 'bank', code: '17', color: '#00539F' },
  { name: 'בנק ירושלים', kind: 'bank', code: '54', color: '#0D4E8C' },
  { name: 'בנק יהב', kind: 'bank', code: '04', color: '#5E9C1C' },
  { name: 'בנק מסד', kind: 'bank', code: '46', color: '#C2185B' },
  { name: 'וואן זירו', kind: 'bank', code: '18', color: '#222222' },
  { name: 'בנק הדואר', kind: 'bank', code: '09', color: '#D71920' },
  { name: 'ישראכרט', kind: 'card_issuer', color: '#0060AF' },
  { name: 'מקס', kind: 'card_issuer', color: '#D6006F' },
  { name: 'כאל', kind: 'card_issuer', color: '#0072BC' },
  { name: 'אמריקן אקספרס', kind: 'card_issuer', color: '#2E77BC' },
  { name: 'דיינרס', kind: 'card_issuer', color: '#004A97' },
  { name: 'הראל', kind: 'pension_provider', color: '#0066B3' },
  { name: 'מגדל', kind: 'pension_provider', color: '#0090D0' },
  { name: 'כלל', kind: 'pension_provider', color: '#1B365D' },
  { name: 'הפניקס', kind: 'pension_provider', color: '#E8831B' },
  { name: 'מנורה מבטחים', kind: 'pension_provider', color: '#0093C9' },
  { name: 'מור', kind: 'pension_provider', color: '#0097D7' },
  { name: 'אלטשולר שחם', kind: 'pension_provider', color: '#C8201E' },
  { name: 'אנליסט', kind: 'pension_provider', color: '#1D4F91' },
  { name: 'ילין לפידות', kind: 'pension_provider', color: '#2B5C9E' },
  { name: 'מיטב', kind: 'pension_provider', color: '#00897B' },
  // Platforms: the Institution kind enum (6.19) has no "platform", so they are "other".
  { name: 'PayPal', kind: 'other', color: '#003087' },
  { name: 'Wise', kind: 'other', color: '#2F6B1F' },
  { name: 'Revolut', kind: 'other', color: '#191C1F' },
  { name: 'Payoneer', kind: 'other', color: '#E04300' },
];

// Appendix B
export const PERSONAL_EXPENSE_CATEGORIES = [
  'מזון וסופר',
  'מסעדות ובתי קפה',
  'דלק',
  'תחבורה ציבורית',
  'רכב (ביטוח, טיפולים, אגרה)',
  'חניה',
  'שכר דירה',
  'ארנונה',
  'חשמל',
  'מים',
  'גז',
  'ועד בית',
  'תקשורת (סלולר, אינטרנט, טלוויזיה)',
  'קופת חולים וביטוח משלים',
  'ביטוחים',
  'בריאות ותרופות',
  'ביגוד והנעלה',
  'בית ותחזוקה',
  'מוצרי חשמל',
  'ילדים (מעון, צהרון, חוגים)',
  'חינוך וקורסים',
  'בילוי ופנאי',
  'חופשות',
  'מנויים דיגיטליים',
  'מתנות ואירועים',
  'חגים',
  'תרומות',
  'חיות מחמד',
  'טיפוח',
  'עמלות בנק',
  'ריבית',
  'מיסים ואגרות',
  'שונות',
];

export const PERSONAL_INCOME_CATEGORIES = [
  'משכורת',
  'בונוס ומשכורת 13',
  'דמי הבראה',
  'תגמולי מילואים',
  'קצבת ילדים',
  'דמי אבטלה',
  'החזר מס',
  'ריבית',
  'דיבידנדים',
  'מתנות',
  'מכירת חפצים',
  'שונות',
];

/**
 * Business system categories. Fixed ids so calc code can find them even if the user renames them
 * (SPEC 11.4 "מקדמות", 11.5 "מע"מ").
 */
export const SYSTEM_CATEGORY_IDS = {
  businessIncome: '6f1d2b1e-0001-4000-8000-000000000001',
  vatPayment: '6f1d2b1e-0001-4000-8000-000000000002',
  incomeTaxAdvances: '6f1d2b1e-0001-4000-8000-000000000003',
  nationalInsuranceAdvances: '6f1d2b1e-0001-4000-8000-000000000004',
} as const;

export const BUSINESS_SYSTEM_CATEGORIES: { id: string; name: string; type: 'income' | 'expense' }[] = [
  { id: SYSTEM_CATEGORY_IDS.businessIncome, name: 'הכנסות מעסק', type: 'income' },
  { id: SYSTEM_CATEGORY_IDS.vatPayment, name: 'מע"מ (תשלום)', type: 'expense' },
  { id: SYSTEM_CATEGORY_IDS.incomeTaxAdvances, name: 'מקדמות מס הכנסה', type: 'expense' },
  { id: SYSTEM_CATEGORY_IDS.nationalInsuranceAdvances, name: 'מקדמות ביטוח לאומי', type: 'expense' },
];

// Appendix B: 15 sectors.
export const SECTORS = [
  'טכנולוגיית מידע',
  'שירותי תקשורת',
  'צריכה מחזורית',
  'צריכה בסיסית',
  'אנרגיה',
  'פיננסים',
  'בריאות',
  'תעשייה',
  'חומרים',
  'נדל"ן',
  'תשתיות',
  'קרנות מחקות מדד',
  'אג"ח',
  'קריפטו',
  'אחר',
];

// Appendix C. Percent values in basis points. Planning defaults only; verify with an accountant.
export interface SeedExpenseClass {
  name: string;
  incomeTaxRecognizedPct: number;
  vatRecognizedPct: number;
  note?: string;
}

export const EXPENSE_CLASSES: SeedExpenseClass[] = [
  { name: 'רכב פרטי (דלק, ביטוח, טיפולים, חניה)', incomeTaxRecognizedPct: 4500, vatRecognizedPct: 6667 },
  { name: 'טלפון נייד', incomeTaxRecognizedPct: 5000, vatRecognizedPct: 6667 },
  { name: 'חדר עבודה בבית (שכ"ד, ארנונה, חשמל)', incomeTaxRecognizedPct: 2500, vatRecognizedPct: 2500, note: 'יחס חדרים, ניתן לעריכה' },
  { name: 'אינטרנט וקו נייח', incomeTaxRecognizedPct: 10000, vatRecognizedPct: 10000 },
  { name: 'כיבוד קל במשרד', incomeTaxRecognizedPct: 8000, vatRecognizedPct: 0, note: 'לאמת' },
  { name: 'קורסים והשתלמויות מקצועיות', incomeTaxRecognizedPct: 10000, vatRecognizedPct: 10000 },
  { name: 'ציוד משרדי ומתכלים', incomeTaxRecognizedPct: 10000, vatRecognizedPct: 10000 },
  { name: 'תוכנות ומנויים לעבודה', incomeTaxRecognizedPct: 10000, vatRecognizedPct: 10000 },
  { name: 'פרסום ושיווק', incomeTaxRecognizedPct: 10000, vatRecognizedPct: 10000 },
  { name: 'שירותי הנהלת חשבונות ורו"ח', incomeTaxRecognizedPct: 10000, vatRecognizedPct: 10000 },
  { name: 'ספרות מקצועית', incomeTaxRecognizedPct: 10000, vatRecognizedPct: 10000 },
  { name: 'עמלות בנק וסליקה', incomeTaxRecognizedPct: 10000, vatRecognizedPct: 0, note: 'אין מע"מ על עמלות בנק' },
  // Appendix C says "לפי פחת" (by depreciation), and the depreciation engine is out of scope.
  // 0% until the user enters a rate, which is the conservative choice for "set aside" (more reserved, not less).
  {
    name: 'ציוד קבוע (מחשב, מצלמה)',
    incomeTaxRecognizedPct: 0,
    vatRecognizedPct: 10000,
    note: 'רכוש קבוע: מוכר לפי פחת. הזן אחוז לפי רו"ח',
  },
  { name: 'ביטוח לאומי, מע"מ ומקדמות מס', incomeTaxRecognizedPct: 0, vatRecognizedPct: 0, note: 'תשלומים לרשויות, לא הוצאה מוכרת' },
];

/**
 * TaxSettings defaults (SPEC 6.18), collected 30/09/2026 and editable by the user.
 * incomeTaxRateBp and nationalInsuranceRateBp are intentionally null: the user enters them (iron rule 4).
 */
export const TAX_DEFAULTS_2026 = {
  year: 2026,
  effectiveFrom: '2026-01-01',
  vatRateBp: 1800,
  incomeTaxRateBp: null,
  nationalInsuranceRateBp: null,
  reserveBasis: 'net_income' as const,
  capitalGainsRateBp: 2500,
  paturCeilingAgorot: 12_283_300,
  pensionAvgWageAgorot: 1_376_900,
  pensionLowRateBp: 445,
  pensionHighRateBp: 1255,
  vatDueDay: 15,
};
