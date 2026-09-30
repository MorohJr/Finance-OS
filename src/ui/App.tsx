import { lazy, Suspense, useState, type ReactNode } from 'react';
import { BrowserRouter, Outlet, Route, Routes, useLocation } from 'react-router';
import { BottomNav } from './components/BottomNav';
import { ToastProvider } from './components/Toast';
import { PinLock } from './components/PinLock';
import { QuickAddSheet } from './screens/QuickAddSheet';
import { HomeScreen } from './screens/HomeScreen';
import { TransactionsScreen } from './screens/TransactionsScreen';
import { TransactionFormScreen } from './screens/TransactionFormScreen';
import { AccountsScreen } from './screens/AccountsScreen';
import { AccountDetailScreen } from './screens/AccountDetailScreen';
import { AccountFormScreen } from './screens/AccountFormScreen';
import { CategoriesScreen } from './screens/CategoriesScreen';
import { CardFormScreen } from './screens/CardFormScreen';
import { CardDetailScreen } from './screens/CardDetailScreen';
import { BudgetScreen } from './screens/BudgetScreen';
import { RecurringScreen } from './screens/RecurringScreen';
import { RecurringFormScreen } from './screens/RecurringFormScreen';
import { ForecastScreen } from './screens/ForecastScreen';
import { RulesScreen } from './screens/RulesScreen';
import { DebtsScreen } from './screens/DebtsScreen';
import { LoanFormScreen } from './screens/LoanFormScreen';
import { LoanDetailScreen } from './screens/LoanDetailScreen';
import { LendingDetailScreen, LendingFormScreen } from './screens/LendingScreens';
import { CheckFormScreen, ChecksScreen } from './screens/ChecksScreen';
import { WishDetailScreen, WishListScreen } from './screens/WishScreens';
import { InvestmentsScreen } from './screens/InvestmentsScreen';
import { PricesScreen, SecurityScreen, TradeFormScreen } from './screens/SecurityScreens';
import { FundScreen, PensionScreen } from './screens/PensionScreens';
import { EmployerFormScreen, PayslipFormScreen, SalaryScreen } from './screens/SalaryScreens';
import { BusinessExpenseScreen, BusinessScreen, BusinessSetupScreen, IncomeCalculatorScreen } from './screens/BusinessScreens';
import { TaxSettingsScreen } from './screens/TaxSettingsScreen';

// SheetJS is large; load the importer only when it's opened.
const ImportScreen = lazy(() => import('./screens/ImportScreen').then((m) => ({ default: m.ImportScreen })));
import { PlanScreen } from './screens/PlanScreen';
import { MoreScreen } from './screens/MoreScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ComingSoonScreen } from './screens/ComingSoonScreen';
import { useApplyTheme, useSettings, useStartupJobs } from './hooks';

/** Forms keep local state, so each navigation gets a fresh instance (e.g. ➕ from inside a form). */
function Fresh({ children }: { children: (key: string) => ReactNode }) {
  const location = useLocation();
  return <>{children(location.key)}</>;
}

function Layout() {
  const [addOpen, setAddOpen] = useState(false);
  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <Outlet />
      <BottomNav onAdd={() => setAddOpen(true)} />
      <QuickAddSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

export function App() {
  const settings = useSettings();
  useApplyTheme(settings);
  useStartupJobs();
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <ToastProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomeScreen />} />
            <Route path="transactions" element={<TransactionsScreen />} />
            <Route path="transactions/new" element={<Fresh>{(k) => <TransactionFormScreen key={k} />}</Fresh>} />
            <Route path="transactions/:id" element={<Fresh>{(k) => <TransactionFormScreen key={k} />}</Fresh>} />
            <Route path="accounts" element={<AccountsScreen />} />
            <Route path="accounts/new" element={<Fresh>{(k) => <AccountFormScreen key={k} />}</Fresh>} />
            <Route path="accounts/:id" element={<AccountDetailScreen />} />
            <Route path="accounts/:id/edit" element={<Fresh>{(k) => <AccountFormScreen key={k} />}</Fresh>} />
            <Route path="cards/new" element={<Fresh>{(k) => <CardFormScreen key={k} />}</Fresh>} />
            <Route path="cards/:id" element={<CardDetailScreen />} />
            <Route path="cards/:id/edit" element={<Fresh>{(k) => <CardFormScreen key={k} />}</Fresh>} />
            <Route path="plan" element={<PlanScreen />} />
            <Route path="plan/budget" element={<BudgetScreen />} />
            <Route path="plan/recurring" element={<RecurringScreen />} />
            <Route path="plan/recurring/new" element={<Fresh>{(k) => <RecurringFormScreen key={k} />}</Fresh>} />
            <Route path="plan/recurring/:id" element={<Fresh>{(k) => <RecurringFormScreen key={k} />}</Fresh>} />
            <Route path="plan/forecast" element={<ForecastScreen />} />
            <Route path="plan/wish" element={<WishListScreen />} />
            <Route path="plan/wish/:id" element={<Fresh>{(k) => <WishDetailScreen key={k} />}</Fresh>} />
            <Route path="debts" element={<DebtsScreen />} />
            <Route path="debts/loans/new" element={<Fresh>{(k) => <LoanFormScreen key={k} />}</Fresh>} />
            <Route path="debts/loans/:id" element={<LoanDetailScreen />} />
            <Route path="debts/loans/:id/edit" element={<Fresh>{(k) => <LoanFormScreen key={k} />}</Fresh>} />
            <Route path="debts/lendings/new" element={<Fresh>{(k) => <LendingFormScreen key={k} />}</Fresh>} />
            <Route path="debts/lendings/:id" element={<LendingDetailScreen />} />
            <Route path="debts/lendings/:id/edit" element={<Fresh>{(k) => <LendingFormScreen key={k} />}</Fresh>} />
            <Route path="investments" element={<InvestmentsScreen />} />
            <Route path="investments/prices" element={<PricesScreen />} />
            <Route path="investments/security/:id" element={<Fresh>{(k) => <SecurityScreen key={k} />}</Fresh>} />
            <Route path="investments/trade/:id" element={<Fresh>{(k) => <TradeFormScreen key={k} />}</Fresh>} />
            <Route path="pension" element={<PensionScreen />} />
            <Route path="pension/:id" element={<Fresh>{(k) => <FundScreen key={k} />}</Fresh>} />
            <Route path="salary" element={<SalaryScreen />} />
            <Route path="salary/employer/:id" element={<Fresh>{(k) => <EmployerFormScreen key={k} />}</Fresh>} />
            <Route path="salary/payslip/:id" element={<Fresh>{(k) => <PayslipFormScreen key={k} />}</Fresh>} />
            <Route path="business" element={<BusinessScreen />} />
            <Route path="business/setup" element={<BusinessSetupScreen />} />
            <Route path="business/income/:id" element={<Fresh>{(k) => <IncomeCalculatorScreen key={k} />}</Fresh>} />
            <Route path="business/expense/:id" element={<Fresh>{(k) => <BusinessExpenseScreen key={k} />}</Fresh>} />
            <Route path="tax" element={<TaxSettingsScreen />} />
            <Route path="checks" element={<ChecksScreen />} />
            <Route path="checks/new" element={<Fresh>{(k) => <CheckFormScreen key={k} />}</Fresh>} />
            <Route path="checks/:id" element={<Fresh>{(k) => <CheckFormScreen key={k} />}</Fresh>} />
            <Route path="more" element={<MoreScreen />} />
            <Route path="settings" element={<SettingsScreen />} />
            <Route path="settings/categories" element={<CategoriesScreen />} />
            <Route path="settings/rules" element={<RulesScreen />} />
            <Route
              path="import"
              element={
                <Suspense fallback={null}>
                  <ImportScreen />
                </Suspense>
              }
            />
            <Route path="soon/:module" element={<ComingSoonScreen />} />
            <Route path="*" element={<HomeScreen />} />
          </Route>
        </Routes>
        <PinLock />
      </ToastProvider>
    </BrowserRouter>
  );
}
