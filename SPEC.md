# Finance OS (IL): מסמך אפיון לבנייה

| | |
| --- | --- |
| **גרסה** | 1.1 |
| **תאריך** | 30/09/2026 |
| **בעלים** | Alex Moroh |
| **קהל יעד** | Claude Code (בנייה), ובעל המוצר (אישור) |
| **סטטוס** | מאושר לבנייה, פרט לסעיף 15 (החלטות פתוחות עם ברירת מחדל) |

> **ל-Claude Code:** זה מסמך האפיון המלא. בנה לפי השלבים בסעיף 13, שלב אחד בכל פעם, והצג תוצאה לאישור לפני המעבר לשלב הבא. אל תוסיף ישות, שדה או מודול שלא מופיעים כאן בלי לשאול. אחוזי מס הכנסה וביטוח לאומי מוזנים ידנית ע"י המשתמש (`TaxSettings`), ומע"מ הוא 18% כברירת מחדל שניתנת לעריכה. אין מספר מס קבוע בקוד, ואין הפקת חשבוניות: רק חישוב. כללי עבודה קצרים נמצאים ב-`CLAUDE.md`.

---

## 1. תקציר

אפליקציית ניהול כספים אישית לישראל, לאייפון, שעובדת בלי שרת ובלי ענן. היא מבוססת על מודל הנתונים של תבנית Notion בשם Finance OS (Advanced 2.1), עם תיקון החולשות שלה והתאמה מלאה לשוק הישראלי.

**מה מבדיל אותה:**

- יתרה שנגזרת רק מתנועות, אף פעם לא מוקלדת.
- כרטיס אשראי ישראלי: חיוב חודשי נדחה, עסקאות בתשלומים, מסגרת פנויה.
- משתמש יכול להיות **שכיר ועצמאי באותו הזמן**: תלושי שכר לצד הכנסות עסקיות, עם הפרדה בין אישי לעסקי.
- מודול עסק לחישוב בלבד: מחשבון הכנסה (מע"מ 18%, נטו, ברוטו), הוצאות מוכרות, דוח מע"מ, ו"כמה לשים בצד" לפי אחוזי מס הכנסה וביטוח לאומי שהמשתמש מזין.
- השקעות במניות, פנסיה, צ'קים, הלוואות וחובות.

## 2. היקף

### 2.1 בתוך ההיקף (v1)

חשבונות, תנועות, העברות, קטגוריות, תקציב, כרטיסי אשראי ותשלומים, חשבונות קבועים ומנויים, Wish List, הלוואות שלקחתי, הלוואות שנתתי, צ'קים, מניות, פנסיה, תלושי שכר, מודול עצמאי (חישובים בלבד), ייבוא קבצים, דוחות, גיבוי ושחזור.

### 2.2 מחוץ להיקף (לא לבנות)

| לא בונים | סיבה |
| --- | --- |
| משכנתא | החלטת בעלים |
| קרן השתלמות | החלטת בעלים |
| סנכרון ענן או שרת | החלטת בעלים: הכול מקומי |
| משיכה אוטומטית מהבנקים (scraping, בנקאות פתוחה) | החלטת בעלים: ידני + ייבוא קבצים |
| ריבוי מטבעות | החלטת בעלים: שקל בלבד |
| ריבוי משתמשים | משתמש אחד |
| הגשת דוחות לרשויות | האפליקציה מחשבת ומכינה נתונים, לא מגישה |
| הפקת חשבוניות, קבלות או כל מסמך ללקוח | החלטת בעלים: חישוב בלבד |
| חישוב מס לפי מדרגות, נקודות זיכוי, או ביטוח לאומי לפי חוק | החלטת בעלים: אחוזים ידניים (11.1) |
| מספר הקצאה | לא רלוונטי בלי הפקת חשבוניות |

## 3. פלטפורמה וארכיטקטורה

### 3.1 החלטות

- **סוג:** Progressive Web App, מותקנת במסך הבית של אייפון, עובדת אופליין מלא.
- **נתונים:** מקומיים בלבד, ב-IndexedDB. אין backend.
- **גיבוי:** ייצוא ויבוא ידני של קובץ JSON (עם הצפנה אופציונלית), וייצוא CSV.

### 3.2 סטאק מומלץ

| שכבה | בחירה | הערה |
| --- | --- | --- |
| שפה | TypeScript (strict) | |
| UI | React + Vite | |
| ניתוב | React Router | |
| מצב ונתונים | Dexie.js מעל IndexedDB, עם `useLiveQuery` | |
| ולידציה | Zod | סכמות משותפות לטפסים, ייבוא וגיבוי |
| עיצוב | Tailwind CSS עם תמיכת RTL | |
| גרפים | Recharts או ECharts | |
| תאריכים | date-fns עם אזור זמן Asia/Jerusalem | |
| PWA | vite-plugin-pwa (Workbox) | |
| קריאת Excel | SheetJS (xlsx) | לייבוא |
| בדיקות | Vitest (לוגיקה), Playwright (זרימות) | |

Claude Code רשאי להחליף ספרייה אם יש סיבה טובה, בתנאי שהוא מציין אותה.

### 3.3 מבנה שכבות

```
src/
  domain/        # טיפוסים, סכמות Zod, קבועים
  calc/          # פונקציות טהורות: יתרות, כרטיסים, הלוואות, מע"מ, לשים בצד
  db/            # Dexie: טבלאות, אינדקסים, מיגרציות, seed
  services/      # פעולות שמשנות נתונים: יצירת תנועה, סגירת חיוב כרטיס, שמירת הכנסה עסקית
  import/        # פרסרים, מיפוי עמודות, זיהוי כפילויות
  ui/            # קומפוננטות ומסכים
  tests/
```

**כלל:** כל חישוב כספי יושב ב-`calc/` כפונקציה טהורה עם בדיקות יחידה. ה-UI לא מחשב כסף בעצמו.

### 3.4 סיכוני פלטפורמה

- **מחיקת נתונים ב-Safari:** WebKit עלול למחוק אחסון של אתר שלא נפתח 7 ימים. אפליקציה שהותקנה במסך הבית פטורה בדרך כלל, אבל צריך: לבקש `navigator.storage.persist()`, להציג באנר "התקן למסך הבית" עד שההתקנה מזוהה, ולהזכיר גיבוי אם עברו יותר מ-7 ימים מהגיבוי האחרון.
- **נפח:** קבלות ותמונות נשמרות מכווצות (JPEG/WebP עד 1600px).
- **נעילה:** קוד PIN אופציונלי במסך פתיחה. זו הגנה מפני מבט מזדמן, לא הצפנה של המכשיר.

## 4. מוסכמות גלובליות

| נושא | כלל |
| --- | --- |
| מטבע | שקל בלבד. אין שדה מטבע בתנועות |
| אחסון סכומים | **מספר שלם באגורות** (`amountAgorot: number`). אסור float לסכומים |
| תצוגה | `₪1,234.56`, עם `Intl.NumberFormat('he-IL')`. אפשרות להסתיר אגורות |
| עיגול | עיגול חצי-למעלה לאגורה, רק בסוף חישוב. אחוזים נשמרים כ-basis points (18% = 1800) |
| תאריכים | נשמרים כ-`YYYY-MM-DD` (תאריך מקומי, בלי שעה). מוצגים `DD/MM/YYYY` |
| חודש | נשמר כ-`YYYY-MM` |
| שבוע | מתחיל ביום ראשון |
| שפה | עברית, RTL מלא. מספרים וסימני ₪ עם `dir="ltr"` מקומי לפי הצורך |
| מזהים | UUID v4 |
| מחיקה | מחיקה רכה (`deletedAt`) לכל ישות פיננסית |
| שדות מערכת | לכל ישות: `id`, `createdAt`, `updatedAt`, `deletedAt?` |

## 5. עקרונות ליבה

1. **היתרה לא נערכת ידנית.** היא סכום התנועות בלבד. תיקון נעשה בתנועת `adjustment` מתועדת.
2. **יתרת פתיחה** היא תנועה מסוג `opening_balance`. היא לא נספרת כהכנסה.
3. **העברה** בין חשבונות לא נספרת כהכנסה או הוצאה.
4. **החזר כספי** (`refund`) מקטין הוצאה בקטגוריה המקורית. הוא לא נספר כהכנסה.
5. **תנועה בלי קטגוריה** נספרת בכל הסיכומים תחת "ללא קטגוריה". אף תנועה לא נעלמת מסיכום.
6. **כל סיכום נגזר.** אין טבלאות סיכום שמורות, פרט לצילומי שווי נטו חודשיים (6.13).
7. **הוצאה בכרטיס אשראי נרשמת בתאריך הקנייה** (לתקציב ולקטגוריות), פרט לעסקת תשלומים במצב `spread` (10.3). ההשפעה על הבנק קורית ביום החיוב.
8. **לכל ישות עסקית יש שדה `context`:** `personal` או `business`. כך אותו משתמש מנהל כספים פרטיים ועסקיים בלי לערבב.

## 6. מודל נתונים

סימונים: ✱ חובה. `→` קישור לישות אחרת. כל הסכומים באגורות.

### 6.1 Account (חשבון)

חשבון שמחזיק כסף. כרטיס אשראי **אינו** חשבון (ראה 6.2).

| שדה | סוג | הערות |
| --- | --- | --- |
| name ✱ | string | |
| kind ✱ | enum | `bank`, `cash`, `savings`, `deposit` (פיקדון), `brokerage` (חשבון מסחר), `prepaid` (כרטיס נטען), `platform` (PayPal, Wise וכו') |
| institutionId | → Institution | בנק או גוף |
| context ✱ | enum | `personal`, `business` |
| overdraftLimit | agorot | מסגרת אשראי בעו"ש (חיובי) |
| overdraftRatePct | bp | ריבית שנתית על המינוס, להצגה והתראה |
| isVisibleOnDashboard | bool | ברירת מחדל true |
| status ✱ | enum | `active`, `closed`. סגירה מותרת רק ביתרה 0 |
| color, icon | string | |
| logoAttachmentId? | id → Attachment | תמונה משלך. גוברת על הלוגו של המוסד (בקשת בעלים 01/10/2026) |
| sortOrder | number | |

**מחושב:** `balance`, `incomeThisMonth`, `expenseThisMonth`, `availableWithOverdraft`, `isOverdrawn`.

### 6.2 Card (כרטיס)

| שדה | סוג | הערות |
| --- | --- | --- |
| name ✱ | string | למשל "כאל ויזה זהב" |
| issuerId ✱ | → Institution | ישראכרט, מקס, כאל, אמריקן אקספרס, דיינרס |
| last4 ✱ | string(4) | רק 4 ספרות. **אסור** לשמור מספר כרטיס מלא |
| kind ✱ | enum | `credit` (חיוב נדחה), `debit` (חיוב מיידי) |
| billingAccountId ✱ | → Account | חשבון הבנק שממנו יורד החיוב |
| chargeDay ✱ | 1..28 | יום החיוב בחודש (נפוץ: 2, 10, 15) |
| cycleCutoffDay | 1..28 או null | יום סגירת המחזור. null = חודש קלנדרי (10.2) |
| creditLimit | agorot | רק ל-`credit` |
| logoAttachmentId? | id → Attachment | תמונה משלך. גוברת על הלוגו של המנפיק |
| context ✱ | enum | |
| status ✱ | enum | `active`, `closed` |

**מחושב:** `openStatementTotal`, `futureInstallmentsTotal`, `availableCredit`, `utilizationPct`, `nextChargeDate`.

כרטיס נטען מוגדר כ-Account מסוג `prepaid`, לא כ-Card.

### 6.3 Transaction (תנועה)

טבלה אחת לכל התנועות. היא מחליפה את שבע טבלאות התנועות של התבנית.

| שדה | סוג | הערות |
| --- | --- | --- |
| date ✱ | date | |
| kind ✱ | enum | ראה טבלה למטה |
| amountAgorot ✱ | int > 0 | תמיד חיובי. הכיוון נקבע לפי `kind` |
| direction | enum | `in`, `out`. **חובה** רק לסוגים עם ± בטבלה: `opening_balance`, `adjustment`, `investment_trade`. בשאר הסוגים ריק |
| accountId | → Account | חובה אם אין `cardId` |
| cardId | → Card | לתנועות בכרטיס |
| toAccountId | → Account | רק ל-`transfer` |
| categoryId | → Category | |
| payeeId | → Payee | בית עסק או אדם |
| description | string | |
| note | string | |
| tags | string[] | |
| context ✱ | enum | `personal`, `business` |
| attachmentIds | → Attachment[] | קבלות |
| paymentMethod | enum | `card`, `bank`, `cash`, `bit`, `paybox`, `pepper`, `check`, `standing_order`, `other` |
| links | object | אופציונלי: `recurringId`, `loanId`, `lendingId`, `wishItemId`, `checkId`, `installmentPlanId`, `statementId`, `payslipId`, `tradeId`, `pensionFundId` (הפקדה עצמאית, 6.15), `importBatchId` (ביטול ייבוא, 9.1) |
| business | object | רק כש-`context=business`. בהוצאה: `vatAgorot`, `expenseClassId`, `supplierInvoiceNumber?`. בהכנסה: `netAgorot`, `vatAgorot`, `incomeTaxReserveAgorot`, `niReserveAgorot` (snapshot מהמחשבון, 11.2) |
| source ✱ | enum | `manual`, `import`, `system` |
| importHash | string | לזיהוי כפילויות |
| status ✱ | enum | `cleared`, `pending` (עתידי, למשל צ'ק דחוי) |

**סוגי תנועה:**

| kind | השפעה על יתרה | נספר כהכנסה/הוצאה | הערות |
| --- | --- | --- | --- |
| `income` | + | הכנסה | |
| `expense` | − (או לכרטיס) | הוצאה | |
| `refund` | + (או לכרטיס) | מקטין הוצאה | מקושר לקטגוריה של ההוצאה |
| `transfer` | − מקור, + יעד | לא | |
| `card_payment` | − בנק | לא | נוצר ע"י המערכת ביום החיוב |
| `opening_balance` | ± | לא | אחת לכל חשבון |
| `adjustment` | ± | לא | תיקון מתועד, דורש הערה |
| `loan_disbursement` | + | לא | קבלת כסף של הלוואה |
| `loan_payment` | − | הוצאה בחלק הריבית בלבד | ראה 10.6 |
| `lending_out` | − | לא | נתתי הלוואה (הופך לחוב לגבייה) |
| `lending_repayment` | + | הכנסה בחלק הריבית בלבד | |
| `investment_trade` | ± | לא | מקושר ל-`InvestmentTrade` |

**הערה על הלוואות:** בתבנית תשלום הלוואה נספר כולו כהוצאה. כאן הקרן היא החזר חוב (לא הוצאה) והריבית היא הוצאה. זה נותן תמונת הוצאות נכונה יותר. בדשבורד מוצג בנפרד "תשלומי הלוואות החודש" במלואם.

### 6.4 CardStatement (חיוב חודשי של כרטיס)

| שדה | סוג | הערות |
| --- | --- | --- |
| cardId ✱ | → Card | |
| chargeDate ✱ | date | |
| periodStart ✱, periodEnd ✱ | date | |
| status ✱ | enum | `open`, `closed`, `paid` |
| paymentTransactionId | → Transaction | ה-`card_payment` שנוצר |
| importedTotal | agorot | אם יובא מקובץ, להשוואה |

**מחושב:** `total` = סכום חיובים (קניות רגילות + תשלום מתוך עסקאות בתשלומים − זיכויים).

### 6.5 InstallmentPlan (עסקה בתשלומים)

| שדה | סוג | הערות |
| --- | --- | --- |
| transactionId ✱ | → Transaction | הקנייה המקורית |
| cardId ✱ | → Card | |
| totalAgorot ✱ | int | |
| count ✱ | int ≥ 2 | |
| kind ✱ | enum | `installments` (תשלומים), `credit` (קרדיט, עם ריבית) |
| interestTotalAgorot | int | לקרדיט |
| firstChargeDate ✱ | date | |
| budgetRecognition ✱ | enum | `upfront` (כל הסכום בחודש הקנייה), `spread` (לפי חודש חיוב). ברירת מחדל מההגדרות |

**מחושב:** לוח תשלומים (`InstallmentCharge[]`: מספר, סכום, חודש חיוב, statementId), `remaining`, `paidCount`.

### 6.6 Category (קטגוריה)

| שדה | סוג | הערות |
| --- | --- | --- |
| name ✱ | string | |
| type ✱ | enum | `income`, `expense` |
| parentId | → Category | תת-קטגוריה, רמה אחת |
| monthlyBudget | agorot | |
| includeInBudget ✱ | bool | |
| context ✱ | enum | `personal`, `business`, `both` |
| icon, color | string | |

### 6.7 Payee ו-CategoryRule

- **Payee:** `name`, `aliases[]` (שמות כפי שמופיעים בדפי חשבון), `defaultCategoryId`, `vatId?` (ח.פ/ע.מ, לספקים עסקיים).
- **CategoryRule:** `match` (`contains` / `equals` / `regex`), `pattern`, `categoryId`, `payeeId?`, `context?`, `priority`. חל בייבוא ובהזנה ידנית (הצעה בלבד בהזנה ידנית).

### 6.8 Recurring (תנועה חוזרת, חשבון קבוע, מנוי)

ישות אחת במקום Bills ו-Subscriptions של התבנית, עם שדה `kind`.

| שדה | סוג | הערות |
| --- | --- | --- |
| name ✱ | string | |
| kind ✱ | enum | `bill` (חשבון קבוע), `subscription` (מנוי), `income` (משכורת קבועה, שכר דירה שאני מקבל), `transfer` (הוראת קבע לחיסכון) |
| amountAgorot | int | ריק ל-`usage_based` |
| frequency ✱ | enum | `usage_based`, `daily`, `weekly`, `monthly`, `bimonthly`, `quarterly`, `semiannual`, `yearly` |
| nextDueDate ✱ | date | מתקדם אוטומטית (10.4) |
| anchorDay | 1..31 | היום המקורי בחודש, כדי לחזור אליו אחרי חודש קצר (10.4). נקבע מה-nextDueDate הראשון |
| accountId / cardId | → | אמצעי תשלום |
| toAccountId | → Account | חשבון היעד, רק ל-`transfer` (הוראת קבע לחיסכון) |
| categoryId | → Category | |
| paymentMethod | enum | כמו ב-Transaction |
| status ✱ | enum | bill: `active`, `inactive`, `grace_period`. subscription: `active`, `inactive`, `trial` |
| trialEndDate | date | |
| commitmentEndDate | date | סוף התחייבות (סלולר, אינטרנט) |
| renewalDate | date | חידוש ביטוח, חוזה שכירות |
| autoCreate ✱ | bool | ליצור תנועה אוטומטית ביום החיוב (סטטוס `pending` עד אישור) |
| reminderDaysBefore | int | |
| linkedToCPI | bool | צמוד מדד (שכר דירה). v1: להצגה בלבד |
| provider, logoAttachmentId, note | | |

### 6.9 WishItem (Wish List)

| שדה | סוג | הערות |
| --- | --- | --- |
| name ✱, priceAgorot ✱ | | |
| category | enum | 16 הקטגוריות של התבנית, בעברית (נספח ב) |
| priority ✱ | enum | `must`, `high`, `medium`, `low` |
| status ✱ | enum | `active`, `inactive`, `paused`, `done` |
| fundingMethod ✱ | enum | `saving`, `installments` |
| startMonth, goalMonth | `YYYY-MM` | כולל שנה (בתבנית חסרה שנה) |
| savingsAccountId | → Account | ל-`saving` |
| store, link, imageAttachmentId | | |

**מחושב:** `savedOrPaid`, `progressPct`, `monthlyNeeded` = (מחיר − נחסך) ÷ חודשים עד היעד, `statusLabel`.

**חיסכון:** נרשם כ-`transfer` לחשבון החיסכון עם `links.wishItemId`. **תשלומים:** `expense` עם `links.wishItemId` (או InstallmentPlan בכרטיס). ראה החלטה פתוחה 15.2.

### 6.10 Loan (הלוואה שלקחתי)

| שדה | סוג | הערות |
| --- | --- | --- |
| name ✱ | string | |
| lenderType ✱ | enum | `bank`, `card_company`, `check_discounting` (ניכיון צ'קים), `pension_fund` (הלוואה מקופה), `private`, `other` |
| principalAgorot ✱ | int | |
| rateType ✱ | enum | `annual` (ברירת מחדל), `total` (סך ריבית על כל התקופה, כמו בתבנית) |
| ratePct ✱ | bp | |
| termMonths ✱ | int | |
| amortization ✱ | enum | `spitzer` (ברירת מחדל), `equal_principal`, `flat` (כמו בתבנית), `bullet` (הכול בסוף, לניכיון צ'קים) |
| startDate ✱, firstPaymentDate ✱ | date | |
| feesAgorot | int | עמלות פתיחה או ניכיון |
| accountId ✱ | → Account | ממנו משלמים |
| receivedToAccountId | → Account | אם הכסף נכנס לחשבון (יוצר `loan_disbursement`) |
| imageAttachmentId | | |

**מחושב:** לוח סילוקין, `monthlyPayment`, `totalWithInterest`, `paidPrincipal`, `paidInterest`, `remainingPrincipal`, `progressPct`, `status` (`active`, `paid_off`, `overdue`).

### 6.11 Lending (הלוואה שנתתי)

| שדה | סוג | הערות |
| --- | --- | --- |
| borrowerName ✱ | string | |
| principalAgorot ✱ | int | |
| ratePct | bp | סך ריבית (כמו בתבנית) |
| date ✱ | date | |
| fromAccountId ✱ | → Account | יוצר `lending_out` |
| expectedEndDate | date | |
| note | string | |

**מחושב:** `totalDue` = קרן × (1 + ריבית), `repaid` = סכום `lending_repayment` מקושרים, `remaining`, `progressPct`, `isPaidOff`. **אין** שדה "שולם עד כה" ידני.

### 6.11א Debt (חוב שאינו הלוואה) — נוסף 01/10/2026 לבקשת הבעלים

חוב בלי מנגנון ריבית של הלוואה: חשבון חשמל שלא שולם, קנס, חוב לרשויות המס, תיק בהוצאה לפועל, הסדר תשלומים.

| שדה | סוג | הערות |
| --- | --- | --- |
| creditor ✱ | string | למי |
| kind ✱ | enum | `utility`, `fine`, `tax_authority`, `collection`, `legal_settlement`, `personal`, `other` |
| originalAmountAgorot ✱ | int | |
| date ✱ | date | |
| status ✱ | enum | `open`, `arrangement` (הסדר), `legal` (טיפול משפטי), `settled` |
| charges | array | תוספות: `{ date, kind: fine/interest/fee/legal/other, amountAgorot, note? }` |
| monthlyPaymentAgorot, paymentDay, planStartDate | | הסדר של סכום קבוע כל חודש |
| accountId, categoryId, caseNumber, context ✱, note | | |

**מחושב:** יתרה = סכום מקורי + תוספות − תשלומים מקושרים (`links.debtId`, מסוג `expense` בקטגוריית החוב). פיגור בהסדר (אחרי 5 ימי חסד), התשלום הבא, מספר התשלומים שנשארו ותאריך סיום. היתרה היא התחייבות בשווי הנטו; התשלום החודשי נכלל במדד החוב ובתחזית.

### 6.12 Check (צ'ק)

| שדה | סוג | הערות |
| --- | --- | --- |
| direction ✱ | enum | `issued` (נתתי), `received` (קיבלתי) |
| number ✱ | string | |
| bankName, branch | string | ל-`received` |
| amountAgorot ✱ | int | |
| issueDate ✱ | date | |
| dueDate ✱ | date | תאריך פירעון (צ'ק דחוי = עתידי) |
| counterparty ✱ | string | |
| accountId ✱ | → Account | החשבון שיחויב או יזוכה |
| status ✱ | enum | `pending`, `deposited`, `cleared`, `bounced`, `cancelled`, `discounted` |
| context ✱ | enum | `personal`, `business` (עיקרון 5.8) |
| categoryId, note, imageAttachmentId | | |
| discountLoanId | → Loan | אם הצ'ק נוכה |

**התנהגות:** יצירת צ'ק יוצרת תנועה `pending` בתאריך הפירעון. מעבר ל-`cleared` הופך אותה ל-`cleared`. `bounced` או `cancelled` מבטל אותה. צ'קים `pending` נכנסים לתחזית היתרה.

### 6.13 NetWorthSnapshot

`month` (`YYYY-MM`), `assets`, `liabilities`, `netWorth`, `liquidAssets`, `breakdown` (JSON). נוצר אוטומטית בפתיחה הראשונה של האפליקציה בכל חודש, עבור החודש הקודם. אם האפליקציה לא נפתחה כמה חודשים, נוצרים צילומים לכל החודשים החסרים (מחושבים לפי תנועות עד סוף כל חודש), כדי שלא יהיו חורים בגרף.

### 6.14 השקעות

**Security (נייר ערך)**

| שדה | סוג | הערות |
| --- | --- | --- |
| symbol ✱ | string | |
| name ✱ | string | |
| exchange ✱ | enum | `TASE`, `NASDAQ`, `NYSE`, `OTHER` |
| type ✱ | enum | `stock`, `etf` (קרן סל), `mutual_fund` (קרן נאמנות), `bond` |
| sectorId | → Sector | 15 הסקטורים של התבנית (נספח ב) |
| priceUnit ✱ | enum | `ILS`, `ILA` (אגורות, מקובל בת"א), `USD` |

**InvestmentTrade (יומן עסקאות)**

| שדה | סוג | הערות |
| --- | --- | --- |
| brokerageAccountId ✱ | → Account (brokerage) | |
| securityId ✱ | → Security | |
| type ✱ | enum | `buy`, `sell`, `dividend`, `fee`, `split`, `tax` |
| date ✱ | date | |
| quantity | decimal (string) | יחידות אפשרות שבר |
| priceAgorotPerUnit | int | במחיר שקלי |
| grossAgorot ✱ | int | שווי העסקה בשקלים |
| feeAgorot | int | |
| taxWithheldAgorot | int | מס שנוכה במקור |
| fxRate | decimal | לעסקאות דולריות: שער ההמרה ששימש |

כל עסקה יוצרת `investment_trade` בחשבון המסחר (קנייה מקטינה מזומן, מכירה ודיבידנד מגדילים).

**PricePoint:** `securityId`, `date`, `priceAgorot`, `source` (`manual`, `import`). v1: עדכון מחיר ידני או מייבוא קובץ. **אין** API חיצוני בגרסה 1 (אין שרת, ובעיות CORS).

**FxRate:** `date`, `usdIls`. הזנה ידנית, להמרת ניירות דולריים לשקלים.

**מחושב לכל נייר:** כמות מוחזקת, עלות (לפי 15.4), מחיר ממוצע, שווי שוק, רווח/הפסד ₪ ו-%, תשואת דיבידנד שוטפת, תשואה על העלות, משקל בתיק, דיבידנד שנתי בפועל (12 חודשים אחרונים), מס רווח הון משוער.

**מחושב לסקטור ולתיק:** סכום השקעה, שווי, משקל, תשואה, דיבידנד שנתי. גרף עוגה בתוך האפליקציה.

### 6.15 PensionFund (פנסיה וגמל)

| שדה | סוג | הערות |
| --- | --- | --- |
| name ✱ | string | |
| productType ✱ | enum | `pension_fund` (קרן פנסיה), `managers_insurance` (ביטוח מנהלים), `provident_fund` (קופת גמל), `investment_provident` (גמל להשקעה), `child_savings` (חיסכון לכל ילד) |
| provider ✱ | string | חברה מנהלת |
| track | string | מסלול השקעה |
| policyLast4 | string | |
| feeFromDepositPct, feeFromBalancePct | bp | דמי ניהול |
| source ✱ | enum | `employer`, `self_employed`, `private` |
| isLiquid ✱ | bool | גמל להשקעה = true, פנסיה = false |

**PensionSnapshot:** `fundId`, `date`, `balanceAgorot`, `depositsEmployeeAgorot`, `depositsEmployerAgorot`, `depositsSeveranceAgorot`, `depositsSelfAgorot`, `returnPct?`. הזנה ידנית מדוח רבעוני או מהמסלקה הפנסיונית / הר הכסף.

הפקדות מתלוש נוצרות אוטומטית מ-Payslip (6.16). הפקדה עצמאית היא `transfer` מחשבון בנק עם `links` לקרן.

### 6.16 Employer ו-Payslip (שכיר)

**Employer:** `name`, `employerVatId?`, `startDate`, `endDate?`, `payDay` (ברירת מחדל 9), `depositAccountId`, `pensionFundId?` (הקרן שמקבלת את הפקדות התלוש).

**Payslip (תלוש)**

| שדה | סוג | הערות |
| --- | --- | --- |
| employerId ✱ | → Employer | |
| month ✱ | `YYYY-MM` | |
| grossAgorot ✱ | int | ברוטו |
| taxableAgorot | int | ברוטו למס (כולל זקיפות שווי). ברירת מחדל = ברוטו |
| incomeTaxAgorot ✱ | int | |
| nationalInsuranceAgorot ✱ | int | |
| healthTaxAgorot ✱ | int | |
| pensionEmployeeAgorot | int | |
| pensionEmployerAgorot, severanceAgorot | int | |
| otherDeductionsAgorot | int | |
| netAgorot ✱ | int | נטו לתשלום. בדיקה: ברוטו − ניכויים = נטו (אזהרה, לא חסימה) |
| components | array | אופציונלי: משכורת 13, הבראה, בונוס, שעות נוספות |
| attachmentId | | צילום תלוש |

**התנהגות:** כל ערכי התלוש מוזנים ידנית מהתלוש עצמו. האפליקציה לא מחשבת מס או ביטוח לאומי לשכיר. שמירת תלוש יוצרת `income` בנטו לחשבון ההפקדה בתאריך התשלום (`payDay` בחודש שאחרי חודש התלוש; `pending` עד שהתאריך מגיע), ו-PensionSnapshot דלתא לקרן המקושרת (`Employer.pensionFundId`, עם `payslipId` על הצילום).

### 6.17 מודול עסק (עצמאי, חישוב בלבד)

**Business**

| שדה | סוג | הערות |
| --- | --- | --- |
| name ✱ | string | |
| vatStatus ✱ | enum | `exempt` (עוסק פטור), `licensed` (עוסק מורשה) |
| openDate | date | |
| vatReportingPeriod | enum | `monthly`, `bimonthly`. רק למורשה |
| isMicroBusiness | bool | עסק זעיר: הוצאה קבועה של 30% במקום הוצאות בפועל |
| businessAccountId | → Account | החשבון שאליו נכנסות הכנסות העסק |
| taxReserveAccountId | → Account | אופציונלי: חשבון חיסכון "קופת מיסים" |

**אין** לקוחות, מסמכים, מספור או PDF. **הכנסה עסקית** היא Transaction עם `context=business`, `kind=income`, שנוצרת ממחשבון ההכנסה (11.2) ושומרת את פירוק החישוב ב-`business.*`. היא יכולה להיות `pending` (לא שולם עדיין) או `cleared`.

**ExpenseClass (סוג הוצאה עסקית):** `name`, `incomeTaxRecognizedPct`, `vatRecognizedPct`, `note`. ערכי ברירת מחדל בנספח ג, כולם ניתנים לעריכה.

**הוצאה עסקית** היא Transaction עם `context=business`, `kind=expense`, ושדות `business.*`.

### 6.18 TaxSettings (הגדרות מס, ידניות)

רשומה לכל שנה. כל שינוי אחוז נשמר עם `effectiveFrom`, כדי ששינוי לא ישנה חישובים שכבר נשמרו.

| שדה | ברירת מחדל | הערות |
| --- | --- | --- |
| vatRateBp ✱ | 1800 (18%) | ניתן לעריכה |
| incomeTaxRateBp ✱ | ריק | אחוז מס הכנסה על הרווח העסקי. **המשתמש מזין** (למשל לפי רו"ח או לפי המדרגה השולית שלו). חובה לפני שימוש במחשבון |
| nationalInsuranceRateBp ✱ | ריק | אחוז ביטוח לאומי + מס בריאות על הרווח העסקי. **המשתמש מזין**. חובה לפני שימוש במחשבון, במצב `percent` |
| nationalInsuranceMode | `fixed_monthly` (למשתמש חדש) | נוסף 01/10/2026: `fixed_monthly` = מקדמה חודשית קבועה (`nationalInsuranceMonthlyAgorot`). במצב הזה המחשבון לא מפריש ב"ל מכל הכנסה, והב"ל המשוער מתחילת השנה = סכום חודשי × חודשים. `percent` = כמו קודם |
| reserveBasis ✱ | `net_income` | על מה מחשבים את האחוזים: `net_income` (כל ההכנסה לפני מע"מ) או `profit_ratio` (לפי יחס רווח מתחילת השנה, 11.2) |
| capitalGainsRateBp | 2500 (25%) | למניות |
| paturCeilingAgorot | ₪122,833 | תקרת עוסק פטור 2026 |
| pensionAvgWageAgorot | ₪13,769 | לחישוב פנסיית חובה (11.6) |
| pensionLowRateBp, pensionHighRateBp | 445, 1255 | |
| vatDueDay | 15 | יום תשלום המע"מ בחודש שאחרי התקופה |

### 6.19 Budget, Import, Attachment, Settings

- **Budget:** אין ישות נפרדת. התקציב הוא `Category.monthlyBudget`. חריגה מחודש לחודש: `BudgetOverride` (`categoryId`, `month`, `amountAgorot`).
- **ImportBatch:** `source`, `fileName`, `importedAt`, `rowCount`, `createdCount`, `skippedDuplicates`, `mappingPresetId`.
- **ImportPreset:** מיפוי עמודות שמור לכל מוסד (9.2).
- **Attachment:** `blob`, `mime`, `size`, `createdAt`.
- **Institution:** `name`, `kind` (`bank`, `card_issuer`, `pension_provider`, `broker`, `other`), `code?`, `color`, `logoAttachmentId?`. Seed בנספח א.
- **Settings:** תמה, הסתרת אגורות, ברירת מחדל `budgetRecognition` לתשלומים, תאריך גיבוי אחרון, PIN, `includeRecurringInBudget`, `costBasisMethod` (`moving_average` / `fifo`, ראה 15.4), `forecastDays` (ברירת מחדל 60, ראה 10.9), `lastNetWorthSnapshotMonth`.

## 7. מסכים וניווט

### 7.1 ניווט

אפליקציית טלפון, יד אחת. **סרגל תחתון** עם חמש לשוניות (מימין לשמאל):

| לשונית | תוכן |
| --- | --- |
| בית | דשבורד |
| תנועות | רשימת תנועות, חיפוש, סינון |
| ➕ | הוספה מהירה (גיליון תחתון) |
| תכנון | תקציב, חשבונות קבועים ומנויים, Wish List, תחזית |
| עוד | חשבונות וכרטיסים, הלוואות וחובות, צ'קים, השקעות, פנסיה, עסק, מס, דוחות, ייבוא, הגדרות |

אם מודול העסק פעיל, הלשונית "עוד" מציגה אותו ראשון, וה-➕ מציע גם "הכנסה עסקית" (מחשבון).

### 7.2 דשבורד (מלמעלה למטה)

1. **כותרת:** שווי נטו + שינוי מהחודש הקודם.
2. **ארבעה מדדים (כרטיסיות):** יתרה נזילה, תקציב החודש (נוצל / נותר), תזרים החודש (הכנסות − הוצאות), חובות (תשלום חודשי כולל).
3. **כרטיסי אשראי:** לכל כרטיס: החיוב הקרוב, תאריך, מסגרת פנויה, פס ניצול.
4. **צפוי ב-30 הימים הקרובים:** חיובי כרטיס, חשבונות קבועים, צ'קים דחויים, תשלומי הלוואות. עם תחזית יתרה בבנק.
5. **תנועות אחרונות:** 5 אחרונות, עם כפתור הוספה.
6. **קטגוריות החודש:** 5 המובילות מול תקציב.
7. **עסק (אם פעיל):** הכנסות החודש, מע"מ לתשלום בתקופה, "לשים בצד" מצטבר, מחזור שנתי מול תקרת פטור.
8. **Wish List ומנויים:** פריטים פעילים עם התקדמות, מנויים שמתחדשים בקרוב.
9. **השקעות:** שווי תיק, תשואה, עוגת סקטורים.

### 7.3 רשימת מסכים

| מסך | עיקר התוכן |
| --- | --- |
| חשבונות | קבוצות: בנק, חיסכון ופיקדונות, מזומן, מסחר, נטען ופלטפורמות. יתרה חיובית/שלילית, סגורים |
| חשבון בודד | יתרה, גרף יתרה, תנועות לפי סוג, הוספה |
| כרטיס בודד | חיוב פתוח, חיובים קודמים, תשלומים עתידיים לפי חודש, מסגרת |
| תנועות | רשימה מקובצת לפי יום, חיפוש, סינון (חשבון, כרטיס, קטגוריה, תגית, context, טווח) |
| הוספה/עריכת תנועה | שדות דינמיים לפי kind. כולל "בתשלומים?" לכרטיס אשראי |
| תקציב | חודש נוכחי, ניווט בין חודשים, קטגוריות עם פס התקדמות, חריגות |
| חשבונות קבועים ומנויים | רשימה לפי תאריך הבא, סה"כ חודשי מנורמל, סימון "שולם" |
| Wish List | גלריה עם תמונות, התקדמות, סינון לפי שיטת מימון |
| הלוואות וחובות | הלוואות שלקחתי (לוח סילוקין), הלוואות שנתתי (יתרה לגבייה) |
| צ'קים | לשוניות: נתתי / קיבלתי, מיון לפי פירעון |
| השקעות | תיק, נייר בודד (עסקאות, גרף), סקטורים, עדכון מחירים מרוכז |
| פנסיה | קרנות, צבירה, הפקדות, דמי ניהול |
| שכר | מעסיקים, תלושים, ממוצעים |
| עסק | סקירה, מחשבון הכנסה, הכנסות, הוצאות עסקיות, מע"מ, לשים בצד, תקרת פטור, פנסיית חובה |
| הגדרות מס | אחוז מס הכנסה, אחוז ביטוח לאומי, מע"מ, תקרת פטור (6.18) |
| דוחות | חודשי, רבעוני, שנתי, שווי נטו לאורך זמן, הוצאות לפי קטגוריה, השוואת שנים |
| ייבוא | אשף (סעיף 9) |
| הגדרות | קטגוריות, כללים, מוסדות, פרמטרי מס, תמה, PIN, גיבוי/שחזור |

## 8. עיצוב

- **כיוון נבחר (30/09/2026): "בנק דיגיטלי".** בלוק כותרת סגול מלא (`#5B3FD9`) עם שווי נטו בלבן, רקע לבנדר בהיר (`#F2F0FA`), כרטיסיות לבנות עם רדיוס 20px, גופן Rubik, הכנסה `#137336` (כהה מעט מהמוקאפ, לניגודיות AA על רקע הלבנדר), הוצאה `#C2362F`. בתמה כהה: רקע `#14122A`, כרטיסיות `#1E1B3A`, אותו סגול.
- **עדכון 01/10/2026 (בקשת בעלים):** הצבע הראשי הוחלף לכחול אינדיגו כהה `#26338C` (רקע `#EFF1F8`, בתמה כהה רקע `#0F1328`, כרטיסיות `#181E3A`). בדשבורד: שורה לבנה פשוטה עם שם האפליקציה וכפתור ההגדרות, ומתחתיה כרטיס שווי נטו מלא בצבע הראשי, קומפקטי, ברוחב המסך.
- **שפה:** אפליקציית בנקאות מודרנית (החלטת בעלים). כרטיסיות עם פינות מעוגלות, מספרים גדולים וברורים, גרפים נקיים, הרבה אוויר.
- **תמות:** בהירה וכהה, לפי הגדרת המערכת עם אפשרות לקבע. כל צבע מוגדר כ-token.
- **צבעים סמנטיים:** הכנסה ירוק, הוצאה אדום, העברה ניטרלי, התראה כתום. צבע לבדו לא נושא מידע: תמיד גם סימן (+/−) או אייקון.
- **טיפוגרפיה:** גופן עברי קריא (למשל Rubik או Heebo מ-Google Fonts, מוטמע מקומית לאופליין). ספרות טבלאיות (`font-variant-numeric: tabular-nums`) בסכומים.
- **לוגואים:** ברירת מחדל: מונוגרמה צבעונית לכל מוסד (אות + צבע המותג). המשתמש יכול להעלות תמונת לוגו. לא לארוז לוגואים של מותגים באפליקציה.
- **נגישות:** יעד מגע מינימלי 44×44, ניגודיות AA, תמיכה בהגדלת טקסט, תוויות ARIA בעברית.
- **תנועה:** אנימציות עדינות, עם כיבוד `prefers-reduced-motion`.
- **iPhone:** safe-area insets, מקלדת מספרית (`inputmode="decimal"`) בשדות סכום, גיליון תחתון להוספה. שדות סכום מוסיפים פסיק אלפים תוך כדי הקלדה.

## 9. ייבוא קבצים

### 9.1 זרימה

1. בחירת קובץ (CSV, XLS, XLSX) ובחירת יעד: חשבון בנק או כרטיס.
2. זיהוי אוטומטי של preset לפי כותרות העמודות. אם אין, מיפוי ידני.
3. תצוגה מקדימה: כל שורה עם קטגוריה מוצעת (לפי CategoryRule), סימון כפילויות, סימון תשלומים.
4. אישור, ויצירת תנועות ב-`source=import` עם `ImportBatch`.
5. אפשרות לבטל ייבוא שלם (מחיקה רכה של כל תנועות ה-batch).

### 9.2 מיפוי (ImportPreset)

שדות יעד: תאריך עסקה, תאריך חיוב, תיאור/בית עסק, סכום חיוב, סכום עסקה מקורי, זכות/חובה (או עמודה אחת עם סימן), מספר תשלום ומתוך כמה, הערות, 4 ספרות כרטיס.

- תמיכה בקבצים עם שורות כותרת לפני הטבלה (דילוג עד שורת הכותרות).
- פורמט תאריך `DD/MM/YYYY` ו-`DD/MM/YY`. סכומים עם פסיקים ו-₪.
- presets ראשוניים לא נכתבים מראש (הפורמטים משתנים). נוצרים בפעם הראשונה ונשמרים.

### 9.3 כללים

- **כפילות:** `importHash` = hash(יעד, תאריך, סכום, תיאור מנורמל, מספר תשלום). כפילות מסומנת ולא נוצרת, אלא אם המשתמש מאשר.
- **תשלומים מכרטיס:** שורה "תשלום 3 מתוך 12" מקושרת ל-InstallmentPlan קיים אם נמצא (לפי בית עסק וסכום), אחרת נוצר plan חדש עם `firstChargeDate` מחושב אחורה.
- **שיוך לחיוב:** בקבצי כרטיס, תאריך החיוב שבקובץ קובע את ה-CardStatement.
- **התאמה:** אם בקובץ יש סה"כ חיוב, הוא נשמר ב-`importedTotal` ומוצג הפרש אם יש.

## 10. לוגיקה וחישובים

כל הפונקציות כאן ב-`calc/`, טהורות, עם בדיקות.

### 10.1 יתרת חשבון

```
balance(account) = Σ signedAmount(t) for t in transactions
  where t.status = 'cleared' and (t.accountId = account or t.toAccountId = account)
```

`signedAmount`: לפי טבלת הסוגים ב-6.3. בהעברה: שלילי במקור, חיובי ביעד. תנועות `pending` לא נכנסות ליתרה, רק לתחזית.

**חשבון במינוס:** `isOverdrawn = balance < 0`. `availableWithOverdraft = balance + overdraftLimit`. התראה ב-80% ניצול מסגרת. ריבית משוערת לחודש = |balance| × ריבית שנתית ÷ 12 (להצגה בלבד).

### 10.2 כרטיס אשראי (חיוב נדחה)

**שיוך רכישה לחיוב:** כל רכישה שייכת למחזור הראשון שתאריך הסגירה שלו ≥ תאריך הרכישה. המחזור מחויב ב-`chargeDay` הראשון שאחרי הסגירה.

- `cycleCutoffDay = null` (ברירת מחדל): המחזור הוא חודש קלנדרי, והוא מחויב ב-`chargeDay` של החודש הבא. למשל, רכישה ב-20/03 בכרטיס עם יום חיוב 10 מחויבת ב-10/04.
- `cycleCutoffDay = c`: המחזור נסגר ב-c בכל חודש. רכישה ב-d ≤ c שייכת לסגירה של אותו חודש, אחרת לסגירה של החודש הבא.
- ייבוא עם תאריך חיוב תמיד גובר על החישוב. אם בייבוא יש פער קבוע מהחישוב, להציע למשתמש לעדכן את `cycleCutoffDay`.

**סגירת חיוב (אוטומטית):** בפתיחת האפליקציה, לכל CardStatement שתאריך החיוב שלו עבר ו-`status≠paid`: יוצרים `card_payment` מחשבון החיוב בסכום ה-`total`, בתאריך החיוב, ומסמנים `paid`. המשתמש יכול לערוך את הסכום אם הבנק חייב אחרת.

**מסגרת:**

```
openStatementTotal = Σ statements where status in (open, closed) and not paid
futureInstallmentsTotal = Σ installment charges with chargeDate > next charge date
availableCredit = creditLimit − openStatementTotal − futureInstallmentsTotal
utilizationPct = (creditLimit − availableCredit) / creditLimit
```

**דביט:** אין Statement. כל תנועה בכרטיס דביט נרשמת ישירות מחשבון החיוב (accountId = billingAccountId).

**זיכוי בכרטיס:** `refund` עם cardId נכנס ל-Statement הבא כסכום שלילי.

### 10.3 עסקאות בתשלומים

```
base = floor(total / count)          // באגורות
first = total − base × (count − 1)   // התשלום הראשון סופג את העודף
charges[i].date = firstChargeDate + i חודשים (בימי החיוב של הכרטיס)
```

- `upfront`: ההוצאה נספרת בתקציב ובקטגוריה בחודש הקנייה במלואה.
- `spread`: כל תשלום נספר בחודש החיוב שלו.
- קרדיט: `total` כולל ריבית. הריבית מוצגת בנפרד.

### 10.4 תנועות חוזרות ותאריך הבא

```
advance(date, frequency):
  daily +1d | weekly +7d | monthly +1m | bimonthly +2m | quarterly +3m
  semiannual +6m | yearly +1y | usage_based: ללא שינוי (המשתמש מעדכן)
```

- הוספת חודשים שומרת על היום בחודש. אם אין יום כזה (31 בפברואר), לוקחים את היום האחרון בחודש, ובחודש שאחריו חוזרים ליום המקורי.
- סימון "שולם" יוצר Transaction מקושר ומקדם את `nextDueDate`.
- `autoCreate`: בפתיחת האפליקציה נוצרות תנועות `pending` לכל מועד שעבר. המשתמש מאשר (הופך ל-`cleared`) או מבטל.
- **נרמול חודשי** (לסיכומים): weekly × 52/12, bimonthly ÷ 2, quarterly ÷ 3, semiannual ÷ 6, yearly ÷ 12.

### 10.5 תקציב

- חודש קלנדרי, 1 עד סוף החודש.
- נכנסות: הוצאות (`expense` − `refund`) בקטגוריות עם `includeInBudget=true`, `context=personal`.
- ברירת מחדל: חשבונות קבועים, מנויים, הלוואות ו-Wish List **לא** נכללים (כמו בתבנית). הגדרה `includeRecurringInBudget` מאפשרת לכלול.
- תשלומים: לפי `budgetRecognition`.
- לכל קטגוריה: `spent`, `remaining = budget − spent`, `overBudget = max(0, spent − budget)`, `usedPct`. סטטוס: עד 80% תקין, 80–100% קרוב, מעל 100% חריגה.

### 10.6 הלוואות (שלקחתי)

**שפיצר** (תשלום קבוע), עם r = ריבית שנתית ÷ 12 ו-n = מספר חודשים:

```latex
PMT = P \cdot \frac{r}{1 - (1 + r)^{-n}}
```

בכל חודש: ריבית = יתרת קרן × r, קרן = PMT − ריבית.

**קרן שווה:** קרן חודשית = P ÷ n, ריבית = יתרה × r (תשלום יורד).

**flat (כמו בתבנית):** תשלום = (P + P × ריבית כוללת) ÷ n.

**rateType=total:** ממירים לריבית כוללת ומשתמשים ב-flat. כך נשמרת תאימות לתבנית.

**עיגול בלוח סילוקין (כל השיטות):** כל תשלום, ריבית וקרן מעוגלים לאגורה בכל חודש. **התשלום האחרון מתקן:** הקרן בו = יתרת הקרן שנשארה בפועל, כך שסך הקרן שווה בדיוק ל-P.

**bullet (ניכיון צ'קים):** אין תשלומים חודשיים. בתאריך הפירעון משולם הכול. עמלה = `feesAgorot`.

**תשלום בפועל:** Transaction `loan_payment` עם loanId. פיצול קרן/ריבית לפי לוח הסילוקין של אותו חודש. אם הסכום שונה, ההפרש נזקף לקרן.

**מדד חוב חודשי** = Σ PMT של הלוואות פעילות + תשלומי תשלומים (InstallmentPlan) של החודש. **שנתי** = Σ תשלומים מתוכננים ב-12 החודשים הבאים (לא × 12, כי הלוואות מסתיימות).

### 10.7 הלוואות שנתתי

```
totalDue = principal × (1 + rate)
repaid = Σ lending_repayment amounts
remaining = max(0, totalDue − repaid)
```

החזר מתפצל: קרן קודם (לא הכנסה), ואחרי שהקרן הוחזרה, היתרה היא ריבית ונספרת כהכנסה.

### 10.8 Wish List

```
savedOrPaid = Σ linked transfers (saving) or Σ linked expenses/installment charges paid (installments)
progressPct = min(100, savedOrPaid / price × 100)
monthsLeft = months between today and goalMonth (מינימום 1)
monthlyNeeded = max(0, price − savedOrPaid) / monthsLeft
status: done אם 100%, "בפיגור" אם progress < הזמן שעבר בין start ל-goal
```

פריטי Wish List בתשלומים **לא** נכנסים למדד החוב (כמו בתבנית), אלא אם שולמו דרך InstallmentPlan בכרטיס, ואז הם חלק מ"תשלומים עתידיים".

### 10.9 תחזית יתרה

לחשבון בנק, ל-N ימים קדימה (ברירת מחדל 60):

```
forecast(day) = balance היום
  + Σ pending transactions until day (צ'קים, תנועות חוזרות שנוצרו)
  + Σ recurring projections until day (לפי nextDueDate ותדירות)
  − Σ card statements charged from this account until day
  − Σ loan payments until day
  + Σ expected salary (Employer.payDay, ממוצע 3 תלושים אחרונים)
```

התראה אם התחזית יורדת מתחת ל-0 או מתחת למסגרת.

### 10.10 השקעות

- **כמות מוחזקת** = Σ buy − Σ sell (+ split adjustments).
- **עלות:** לפי שיטה בהגדרות (15.4). ברירת מחדל: ממוצע משוקלל נע.
- **מחיר ממוצע** = עלות ÷ כמות.
- **שווי שוק** = כמות × מחיר אחרון (ILA ÷ 100; USD × שער אחרון).
- **רווח לא ממומש** = שווי − עלות. **%** = רווח ÷ עלות.
- **רווח ממומש** במכירה = תמורה − עמלה − עלות היחידות שנמכרו.
- **תשואת דיבידנד שוטפת** = דיבידנד 12 חודשים ÷ שווי שוק. **על העלות** = דיבידנד 12 חודשים ÷ עלות.
- **משקל** = שווי נייר ÷ שווי תיק. **משקל סקטור** = Σ שווי בסקטור ÷ שווי תיק.
- **מס רווח הון משוער** = max(0, רווח ממומש בשנה − הפסדים ממומשים בשנה) × 25% (פרמטר). הערכה בלבד: לא כולל התאמת אינפלציה, קיזוזים מורכבים או מס שנוכה בפועל.

### 10.11 שווי נטו

```
assets = Σ balance(accounts where balance > 0)
       + Σ market value (securities)
       + Σ latest pension balances
       + Σ lending remaining
liabilities = Σ |balance| (accounts where balance < 0)
            + Σ card openStatementTotal + futureInstallmentsTotal
            + Σ loan remainingPrincipal
            + Σ checks issued pending
netWorth = assets − liabilities
liquidAssets = assets − pension (isLiquid=false) − lending remaining
```

### 10.12 תזרים ויחסים

- **הכנסות החודש** = Σ income (כולל תלושים, והכנסות עסקיות לפי `net` בלי מע"מ). לא כולל העברות, יתרות פתיחה וקבלת הלוואה.
- **הוצאות החודש** = Σ expense − refund + ריבית הלוואות + תשלומי חשבונות ומנויים (כולם expense ממילא).
- **תזרים** = הכנסות − הוצאות. **יחס הוצאות להכנסות** = הוצאות ÷ הכנסות. **שיעור חיסכון** = תזרים ÷ הכנסות.
- מסננים: personal / business / הכול.
- **דוחות רבעוניים ושנתיים:** אותם חישובים לפי טווח. שנים נגזרות מהנתונים, לא קבועות.

## 11. מיסים ועסק (חישוב בלבד)

> **הסתייגות שמוצגת באפליקציה:** החישובים מבוססים על האחוזים שהזנת. הם כלי תכנון ואינם ייעוץ מס.

**עקרונות:**

- האפליקציה **לא** מחשבת מדרגות מס, נקודות זיכוי או ביטוח לאומי לפי חוק. אחוז מס הכנסה ואחוז ביטוח לאומי מוזנים ידנית ב-TaxSettings (6.18).
- מע"מ: 18% כברירת מחדל.
- **אין הפקת חשבוניות.** מחשבון ההכנסה מחשב ושומר תנועה בלבד.
- שכיר: ערכי התלוש מוזנים ידנית (6.16). אין חישוב.
- כל הפונקציות ב-`calc/business/`, מקבלות את ההגדרות כפרמטר, ומחזירות פירוט שורה-שורה כדי שהמסך יציג "איך הגענו לזה".

### 11.1 הגדרות

ראה 6.18. לפני השימוש הראשון במחשבון ההכנסה, אם `incomeTaxRateBp` או `nationalInsuranceRateBp` ריקים, מוצג מסך קצר שמבקש להזין אותם, עם הסבר של משפט אחד לכל שדה.

### 11.2 מחשבון הכנסה עסקית

**קלט:** סכום, מצב (`excl_vat` = לפני מע"מ, `incl_vat` = כולל מע"מ), תאריך, ממי (Payee), חשבון, סטטוס (התקבל / ממתין), הערה.

**מע"מ:**

```
עוסק מורשה, excl_vat: net = amount
                      vat = round(net × vatRate)
                      total = net + vat
עוסק מורשה, incl_vat: total = amount
                      net = round(total / (1 + vatRate))
                      vat = total − net
עוסק פטור:            vat = 0, net = total = amount
```

**לשים בצד:**

```
base = net                                  // reserveBasis = net_income
     או net × profitRatio                   // reserveBasis = profit_ratio
profitRatio = profitYTD / revenueYTD        // 11.4; ברירת מחדל 1 אם אין נתונים; תחום 0..1
incomeTaxReserve = round(base × incomeTaxRate)
niReserve        = round(base × nationalInsuranceRate)
vatReserve       = vat
setAside   = vatReserve + incomeTaxReserve + niReserve
leftForYou = total − setAside
```

**שמירה:** יוצרת `income` בסכום `total` בחשבון שנבחר (כך היתרה נכונה), עם `business.netAgorot`, `vatAgorot`, `incomeTaxReserveAgorot`, `niReserveAgorot`. האחוזים שחלו נשמרים ב-snapshot, כך ששינוי אחוז בעתיד לא משנה הכנסות שכבר נשמרו. אם הוגדר `taxReserveAccountId`, מוצע כפתור "העבר לקופת מיסים" שיוצר `transfer` בסכום `setAside`.

**בדוחות:** ההכנסה העסקית נספרת לפי `net` (בלי מע"מ). המע"מ מוצג כהתחייבות (11.5).

### 11.3 הוצאות עסקיות

```
עוסק מורשה: vatDeductible = vat × vatRecognizedPct
            recognizedExpense = (amount − vatDeductible) × incomeTaxRecognizedPct
עוסק פטור:  vatDeductible = 0
            recognizedExpense = amount × incomeTaxRecognizedPct
עסק זעיר:   recognizedExpenses (לשנה) = 30% × revenue, במקום סכום ההוצאות בפועל
```

בהזנת הוצאה עסקית: שדה סכום כולל מע"מ, והמע"מ מחושב אוטומטית (ניתן לעריכה, למשל לספק פטור = 0).

### 11.4 רווח ומיסים מתחילת השנה (מסך "עסק")

| שורה | חישוב |
| --- | --- |
| הכנסות (ללא מע"מ) | Σ net של הכנסות עסקיות `cleared` |
| הוצאות מוכרות | 11.3 |
| רווח | הכנסות − הוצאות מוכרות |
| מס הכנסה משוער | רווח × incomeTaxRate |
| ביטוח לאומי משוער | רווח × nationalInsuranceRate |
| הופרש בצד (לפי המחשבון) | Σ incomeTaxReserve + niReserve |
| שולם בפועל | Σ תנועות בקטגוריות "מקדמות מס הכנסה" ו-"מקדמות ביטוח לאומי" |
| פער | משוער − שולם בפועל (חיובי = צפוי לתשלום, שלילי = שולם יותר) |

הערה במסך: ההפרשה במחשבון מחושבת על כל הכנסה, ולכן היא בדרך כלל גבוהה מהחבות לפי הרווח. ההפרש הוא כסף שהופרש "ביתר".

### 11.5 מע"מ (עוסק מורשה)

```
period    = חודשי או דו-חודשי (ינואר–פברואר, מרץ–אפריל, ...)
outputVat = Σ business.vatAgorot של הכנסות עסקיות בתקופה (לפי תאריך התנועה)
inputVat  = Σ vatDeductible של הוצאות עסקיות בתקופה
vatDue    = outputVat − inputVat          // שלילי = החזר
dueDate   = vatDueDay בחודש שאחרי סוף התקופה
```

מסך מע"מ: טבלה לכל תקופה עם עסקאות, תשומות, לתשלום או להחזר, וסטטוס (פתוחה, שולמה). סימון "שולם" יוצר `expense` עסקי בקטגוריה "מע"מ", שלא נספר כהוצאה מוכרת. עוסק פטור: אין מסך מע"מ.

### 11.6 פנסיית חובה לעצמאי

```
half = avgWage / 2
obligationMonthly = min(profitMonthly, half) × pensionLowRate
                  + max(0, min(profitMonthly, avgWage) − half) × pensionHighRate
profitMonthly = max(0, רווח מתחילת השנה) ÷ חודשים שעברו   // הפסד = אין חובה
```

מוצג: החובה המשוערת, ההפקדות בפועל (PensionFund עם `source=self_employed`), והפער. הערה: מעל גיל 60 ובחצי השנה הראשונה מפתיחת העסק אין חובה, ומי שגם שכיר מפקיד רק את ההפרש שהמעסיק לא מכסה ([כל זכות](https://www.kolzchut.org.il/he/מדריך_לשכירים_שהם_גם_עצמאים)).

### 11.7 עוסק פטור: מעקב תקרה

```
turnoverYTD  = Σ הכנסות עסקיות (total) מ-1/1 בשנה הנוכחית. שכר לא נספר
pctOfCeiling = turnoverYTD / paturCeiling
projected    = turnoverYTD × 12 / monthsElapsed
```

התראות: ב-80% מהתקרה, כשהתחזית השנתית עוברת את התקרה, וב-100%. ההודעה אומרת שכדאי לפנות לרואה חשבון לגבי מעבר לעוסק מורשה.

### 11.8 מניות

רווח הון ממומש ודיבידנדים × `capitalGainsRate`, פחות מס שנוכה במקור (`taxWithheldAgorot`). הערכה בלבד, בלי התאמה לאינפלציה וקיזוזים בין שנים.

## 12. גיבוי, אבטחה ופרטיות

- **ללא שרת:** שום נתון לא יוצא מהמכשיר, פרט לקובץ גיבוי שהמשתמש מייצא בעצמו.
- **גיבוי:** ייצוא JSON מלא (כל הטבלאות + קבצים מצורפים כ-base64), עם גרסת סכמה. הצפנה אופציונלית בסיסמה (WebCrypto, AES-GCM, PBKDF2 עם 310,000 איטרציות). שחזור מחליף את כל הנתונים אחרי אישור כפול, עם ולידציית Zod ומיגרציה אם הגרסה ישנה.
- **תזכורת גיבוי** כשעברו יותר מ-7 ימים.
- **CSV:** ייצוא תנועות לפי טווח (לרואה חשבון).
- **נתונים רגישים:** אין מספר כרטיס מלא, אין סיסמאות בנק, אין מספר חשבון מלא (4 ספרות אחרונות בלבד). ת.ז לא נשמרת.
- **PIN:** אופציונלי, hash עם salt. נעילה אחרי 5 דקות ברקע.
- **מיגרציות:** כל שינוי סכמה עם מספר גרסה ב-Dexie ופונקציית upgrade. אסור לאבד נתונים בעדכון.

## 13. שלבי בנייה וקריטריוני קבלה

כל שלב מסתיים באפליקציה שעובדת, בבדיקות ירוקות, ובהדגמה לבעלים.

| שלב | תוכן | קריטריוני קבלה |
| --- | --- | --- |
| **0. תשתית** | פרויקט, PWA, RTL, תמות, ניווט תחתון, Dexie, Zod, seed (נספחים), גיבוי/שחזור | מותקן במסך הבית באייפון, עובד במצב טיסה, גיבוי ושחזור עוברים סבב מלא |
| **1. ליבה** | חשבונות, תנועות (כל ה-kinds הבסיסיים), קטגוריות, העברות, יתרות, רשימת תנועות, הוספה מהירה, קוד PIN, ייצוא CSV | יתרה = סכום תנועות בכל תרחיש; העברה לא משנה הכנסות/הוצאות |
| **2. כרטיסים** | Card, CardStatement, תשלומים, סגירת חיוב אוטומטית, מסגרת פנויה, דביט | דוגמאות 14.2 עוברות; חיוב שנסגר יוצר card_payment פעם אחת בלבד |
| **3. תכנון** | Recurring (כולל דו-חודשי), תקציב, דשבורד, תחזית 60 יום | קידום תאריכים לפי 10.4; תקציב לפי 10.5 |
| **4. ייבוא** | אשף, presets, כללי קטגוריה, כפילויות, תשלומים מקבצי כרטיס | ייבוא אותו קובץ פעמיים לא יוצר כפילויות |
| **5. חובות וצ'קים** | Loan (כל שיטות ההחזר), Lending, Check, Wish List | לוח שפיצר תואם דוגמה 14.3 |
| **6. השקעות ופנסיה** | Security, Trade, PricePoint, תיק, סקטורים, PensionFund, שווי נטו וצילומים חודשיים | שווי תיק ורווח תואמים חישוב ידני |
| **7. שכר** | Employer, Payslip (הזנה ידנית), הכנסה מתלוש, הפקדות פנסיה | תלוש יוצר הכנסה בנטו והפקדה לקרן |
| **8. עסק** | Business, TaxSettings, מחשבון הכנסה, הוצאות עסקיות, ExpenseClass, מע"מ, לשים בצד, רווח ומיסים מתחילת השנה, פנסיית חובה, תקרת פטור | דוגמאות 14.4–14.8 |
| **9. דוחות וליטוש** | דוחות, גרפים, נגישות, ביצועים | Lighthouse PWA ירוק; 10,000 תנועות בלי האטה מורגשת |

## 14. בדיקות ודוגמאות זהב

כל פונקציה ב-`calc/` עם בדיקות יחידה. הדוגמאות האלה חייבות לעבור בדיוק (עיגול לאגורה):

**14.1 יתרה:** יתרת פתיחה 1,000, הכנסה 500, הוצאה 200, העברה 300 לחיסכון → יתרה 1,000; חיסכון 300; הכנסות החודש 500; הוצאות 200.

**14.2 כרטיס ותשלומים:** כרטיס עם `chargeDay=10`, `cycleCutoffDay=null`, מסגרת 10,000. רכישה ב-20/03 של ₪1,000 ב-3 תשלומים → חיובים: 10/04 ₪333.34, 10/05 ₪333.33, 10/06 ₪333.33. ביום 21/03: חיוב פתוח (של 10/04) 333.34, תשלומים עתידיים 666.66, מסגרת פנויה 9,000.00.

**14.3 הלוואה:** ₪50,000, ריבית שנתית 6%, 36 חודשים:
- שפיצר: תשלום חודשי ₪1,521.10, סה"כ ₪54,759.49.
- קרן שווה: תשלום ראשון ₪1,638.89, אחרון ₪1,395.79 (קרן אחרונה ₪1,388.85 מתקנת את העיגול, 10.6).
- flat עם ריבית כוללת 6%: ₪1,472.22 לחודש.

**14.4 מחשבון הכנסה (עוסק מורשה, מע"מ 18%):** ₪5,000 `excl_vat` → מע"מ ₪900, סה"כ ₪5,900. ₪5,900 `incl_vat` → נטו ₪5,000, מע"מ ₪900. עוסק פטור, ₪5,000 → מע"מ ₪0, סה"כ ₪5,000.

**14.5 לשים בצד:** מס הכנסה 20%, ביטוח לאומי 16%, `reserveBasis=net_income`, הכנסה ₪5,000 לפני מע"מ:
- מס הכנסה ₪1,000, ביטוח לאומי ₪800, מע"מ ₪900.
- לשים בצד ₪2,700, נשאר ₪3,200 (מתוך ₪5,900).
- אותו מקרה עם `profit_ratio` ויחס רווח 0.8: בסיס ₪4,000, מס ₪800, ב"ל ₪640, לשים בצד ₪2,340, נשאר ₪3,560.

**14.6 מע"מ לתקופה:** הכנסות עם מע"מ ₪900 + ₪1,800. הוצאות: דלק ₪590 כולל מע"מ (מע"מ ₪90, מוכר 2/3 = ₪60), מחשב ₪5,900 כולל מע"מ (מע"מ ₪900, מוכר 100%). עסקאות ₪2,700, תשומות ₪960, **לתשלום ₪1,740**.

**14.7 תקרת פטור:** תקרה ₪122,833. מחזור ₪98,266.40 (80%) → התראה ראשונה. מחזור ₪60,000 אחרי 4 חודשים → תחזית שנתית ₪180,000 → התראת תחזית.

**14.8 פנסיית חובה:** שכר ממוצע ₪13,769, רווח חודשי ₪8,000 → ₪446.36 לחודש. רווח ₪20,000 → ₪1,170.37 (המקסימום).

## 15. החלטות פתוחות (עם ברירת מחדל)

Claude Code בונה לפי ברירת המחדל, ומסמן בקוד `// DECISION 15.x` כדי שיהיה קל לשנות.

| # | שאלה | ברירת מחדל | למה |
| --- | --- | --- | --- |
| 15.1 | ריבית בהלוואה: שנתית או סך ריבית? | שנתית + שפיצר, עם אפשרות `total` + flat | ההוראות המקוריות משתמשות בסך ריבית, שנותן תשלום שגוי בהלוואות בנקאיות |
| 15.2 | חיסכון ל-Wish List: הכנסה או העברה? | העברה לחשבון חיסכון | בתבנית זו "הכנסה", שמנפחת הכנסות. העברה עקבית עם עיקרון 3 |
| 15.3 | תשלומים בכרטיס בתקציב | `spread` (לפי חודש חיוב) | משקף את היציאה החודשית בפועל |
| 15.4 | שיטת עלות בניירות ערך | ממוצע משוקלל נע | פשוט וקריא. אפשרות FIFO בהגדרות |
| 15.5 | תקציב כולל חשבונות ומנויים? | לא (כמו בתבנית), עם מתג | |

## 16. הסתייגויות ומקורות

- החישובים אינם ייעוץ מס או ייעוץ פיננסי. אחוזי המס והביטוח הלאומי הם של המשתמש, ויש לאמת מול רואה חשבון.
- ערכי ברירת המחדל (מע"מ, תקרת פטור, שכר ממוצע) נאספו ב-30/09/2026 וניתנים לעריכה ב-TaxSettings.
- תבנית המקור: Finance OS (Advanced 2.1) ב-Notion. קוד הנוסחאות שלה לא נחשף, והלוגיקה כאן מבוססת על מבנה הנתונים, המדריך והתאמה לישראל. מסמך המחקר המלא: `finance-os-research-israel.md` בפרויקט.

**מקורות:** [מע"מ ותקרת עוסק פטור 2026 (CWS)](https://www.cwsisrael.com/freelancer-invoice-deductions-israel-2026/) · [שכירים שהם גם עצמאים (כל זכות)](https://www.kolzchut.org.il/he/מדריך_לשכירים_שהם_גם_עצמאים) · [פנסיה לעצמאים 2026 (Pensuni)](https://pensuni.com/?p=3960) · [הוצאות מוכרות (Moneyplan)](https://moneyplan.co.il/?p=15448) · [ריבית בנק ישראל](https://www.boi.org.il/en/communication-and-publications/press-releases/01-9-26-en/)

---

## נספח א: מוסדות (seed)

| סוג | רשימה |
| --- | --- |
| בנקים | הפועלים, לאומי, דיסקונט, מזרחי-טפחות, הבינלאומי, מרכנתיל, ירושלים, יהב, מסד, וואן זירו, בנק הדואר |
| חברות כרטיסים | ישראכרט, מקס, כאל, אמריקן אקספרס, דיינרס |
| פנסיה וגמל | הראל, מגדל, כלל, הפניקס, מנורה מבטחים, מור, אלטשולר שחם, אנליסט, ילין לפידות, מיטב |
| פלטפורמות | PayPal, Wise, Revolut, Payoneer |

אפליקציות תשלום (ביט, פייבוקס, פפר פיי) הן `paymentMethod`, לא מוסדות ולא חשבונות.

## נספח ב: קטגוריות וערכי בחירה (seed)

**קטגוריות הוצאה (אישי):** מזון וסופר · מסעדות ובתי קפה · דלק · תחבורה ציבורית · רכב (ביטוח, טיפולים, אגרה) · חניה · שכר דירה · ארנונה · חשמל · מים · גז · ועד בית · תקשורת (סלולר, אינטרנט, טלוויזיה) · קופת חולים וביטוח משלים · ביטוחים · בריאות ותרופות · ביגוד והנעלה · בית ותחזוקה · מוצרי חשמל · ילדים (מעון, צהרון, חוגים) · חינוך וקורסים · בילוי ופנאי · חופשות · מנויים דיגיטליים · מתנות ואירועים · חגים · תרומות · חיות מחמד · טיפוח · עמלות בנק · ריבית · מיסים ואגרות · שונות

**קטגוריות הכנסה (אישי):** משכורת · בונוס ומשכורת 13 · דמי הבראה · תגמולי מילואים · קצבת ילדים · דמי אבטלה · החזר מס · ריבית · דיבידנדים · מתנות · מכירת חפצים · שונות

**קטגוריות עסק:** הכנסות מעסק · מע"מ (תשלום) · מקדמות מס הכנסה · מקדמות ביטוח לאומי · וכל ה-ExpenseClass (נספח ג) כקטגוריות הוצאה עסקיות

**קטגוריות Wish List (16, מהתבנית):** אלקטרוניקה · ביגוד ואקססוריז · בית וגינה · ספרים ומדיה · ספורט ושטח · צעצועים ומשחקים · בריאות ויופי · רכב · מוצרי חשמל · מזון ומשקאות · אומנות ויצירה · ריהוט ועיצוב · כלי נגינה · ציוד משרדי · מוצר דיגיטלי · תכשיטים ושעונים

**סקטורים (15):** טכנולוגיית מידע · שירותי תקשורת · צריכה מחזורית · צריכה בסיסית · אנרגיה · פיננסים · בריאות · תעשייה · חומרים · נדל"ן · תשתיות · קרנות מחקות מדד · אג"ח · קריפטו · אחר. (11 הראשונים לפי GICS, בהתאם לסקטורים שבתבנית.)

## נספח ג: סוגי הוצאה עסקית (ExpenseClass, ברירות מחדל)

ערכים נפוצים לתכנון, **לאמת מול רואה חשבון** ([Moneyplan](https://moneyplan.co.il/?p=15448)). כולם ניתנים לעריכה.

| סוג | % מוכר במס הכנסה | % מע"מ לקיזוז | הערה |
| --- | --- | --- | --- |
| רכב פרטי (דלק, ביטוח, טיפולים, חניה) | 45% | 66.67% | |
| טלפון נייד | 50% | 66.67% | |
| חדר עבודה בבית (שכ"ד, ארנונה, חשמל) | 25% | 25% | יחס חדרים, ניתן לעריכה |
| אינטרנט וקו נייח | 100% | 100% | |
| כיבוד קל במשרד | 80% | 0% | לאמת |
| קורסים והשתלמויות מקצועיות | 100% | 100% | |
| ציוד משרדי ומתכלים | 100% | 100% | |
| תוכנות ומנויים לעבודה | 100% | 100% | |
| פרסום ושיווק | 100% | 100% | |
| שירותי הנהלת חשבונות ורו"ח | 100% | 100% | |
| ספרות מקצועית | 100% | 100% | |
| עמלות בנק וסליקה | 100% | 0% | אין מע"מ על עמלות בנק |
| ציוד קבוע (מחשב, מצלמה) | לפי פחת | 100% | v1: נרשם כהוצאה עם סימון "רכוש קבוע". מנוע פחת מחוץ להיקף |
| ביטוח לאומי, מע"מ ומקדמות מס | 0% | 0% | תשלומים לרשויות, לא הוצאה מוכרת |
