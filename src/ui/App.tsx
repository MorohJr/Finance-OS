import { lazy, Suspense, useState, type ComponentType, type ReactNode } from 'react';
import { BrowserRouter, Outlet, Route, Routes, useLocation } from 'react-router';
import { BottomNav } from './components/BottomNav';
import { ToastProvider } from './components/Toast';
import { PinLock } from './components/PinLock';
import { UpdateBanner } from './components/UpdateBanner';
import { DemoBanner } from './components/DemoBanner';
import { QuickAddSheet } from './screens/QuickAddSheet';
import { HomeScreen } from './screens/HomeScreen';
import { TransactionsScreen } from './screens/TransactionsScreen';
import { TransactionFormScreen } from './screens/TransactionFormScreen';

import { PlanScreen } from './screens/PlanScreen';
import { MoreScreen } from './screens/MoreScreen';
import { useApplyTheme, useSettings, useStartupJobs } from './hooks';
// Everything beyond the core screens is loaded on first use (SPEC 13 stage 9: performance).
const named = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) => lazy(() => load().then((m) => ({ default: m[name] })));
const AccountsScreen = named(() => import('./screens/AccountsScreen'), 'AccountsScreen');
const AccountDetailScreen = named(() => import('./screens/AccountDetailScreen'), 'AccountDetailScreen');
const AccountFormScreen = named(() => import('./screens/AccountFormScreen'), 'AccountFormScreen');
const CategoriesScreen = named(() => import('./screens/CategoriesScreen'), 'CategoriesScreen');
const CardFormScreen = named(() => import('./screens/CardFormScreen'), 'CardFormScreen');
const CardDetailScreen = named(() => import('./screens/CardDetailScreen'), 'CardDetailScreen');
const BudgetScreen = named(() => import('./screens/BudgetScreen'), 'BudgetScreen');
const RecurringScreen = named(() => import('./screens/RecurringScreen'), 'RecurringScreen');
const RecurringFormScreen = named(() => import('./screens/RecurringFormScreen'), 'RecurringFormScreen');
const ForecastScreen = named(() => import('./screens/ForecastScreen'), 'ForecastScreen');
const RulesScreen = named(() => import('./screens/RulesScreen'), 'RulesScreen');
const DebtsScreen = named(() => import('./screens/DebtsScreen'), 'DebtsScreen');
const LoanFormScreen = named(() => import('./screens/LoanFormScreen'), 'LoanFormScreen');
const LoanDetailScreen = named(() => import('./screens/LoanDetailScreen'), 'LoanDetailScreen');
const LendingDetailScreen = named(() => import('./screens/LendingScreens'), 'LendingDetailScreen');
const LendingFormScreen = named(() => import('./screens/LendingScreens'), 'LendingFormScreen');
const CheckFormScreen = named(() => import('./screens/ChecksScreen'), 'CheckFormScreen');
const ChecksScreen = named(() => import('./screens/ChecksScreen'), 'ChecksScreen');
const WishDetailScreen = named(() => import('./screens/WishScreens'), 'WishDetailScreen');
const WishListScreen = named(() => import('./screens/WishScreens'), 'WishListScreen');
const InvestmentsScreen = named(() => import('./screens/InvestmentsScreen'), 'InvestmentsScreen');
const PricesScreen = named(() => import('./screens/SecurityScreens'), 'PricesScreen');
const SecurityScreen = named(() => import('./screens/SecurityScreens'), 'SecurityScreen');
const TradeFormScreen = named(() => import('./screens/SecurityScreens'), 'TradeFormScreen');
const FundScreen = named(() => import('./screens/PensionScreens'), 'FundScreen');
const PensionScreen = named(() => import('./screens/PensionScreens'), 'PensionScreen');
const EmployerFormScreen = named(() => import('./screens/SalaryScreens'), 'EmployerFormScreen');
const PayslipFormScreen = named(() => import('./screens/SalaryScreens'), 'PayslipFormScreen');
const SalaryScreen = named(() => import('./screens/SalaryScreens'), 'SalaryScreen');
const BusinessExpenseScreen = named(() => import('./screens/BusinessScreens'), 'BusinessExpenseScreen');
const BusinessScreen = named(() => import('./screens/BusinessScreens'), 'BusinessScreen');
const BusinessSetupScreen = named(() => import('./screens/BusinessScreens'), 'BusinessSetupScreen');
const IncomeCalculatorScreen = named(() => import('./screens/BusinessScreens'), 'IncomeCalculatorScreen');
const TaxSettingsScreen = named(() => import('./screens/TaxSettingsScreen'), 'TaxSettingsScreen');
const SettingsScreen = named(() => import('./screens/SettingsScreen'), 'SettingsScreen');
const ImportScreen = named(() => import('./screens/ImportScreen'), 'ImportScreen');
const ReportsScreen = named(() => import('./screens/ReportsScreen'), 'ReportsScreen');
const DebtFormScreen = named(() => import('./screens/OwedScreens'), 'DebtFormScreen');
const DebtDetailScreen = named(() => import('./screens/OwedScreens'), 'DebtDetailScreen');
const InstitutionsScreen = named(() => import('./screens/InstitutionsScreen'), 'InstitutionsScreen');


/** Forms keep local state, so each navigation gets a fresh instance (e.g. ➕ from inside a form). */
function Fresh({ children }: { children: (key: string) => ReactNode }) {
  const location = useLocation();
  return <>{children(location.key)}</>;
}

function Layout() {
  const [addOpen, setAddOpen] = useState(false);
  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <DemoBanner />
      <Suspense fallback={<div className="min-h-dvh" />}>
        <Outlet />
      </Suspense>
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
            <Route path="debts/owed/new" element={<Fresh>{(k) => <DebtFormScreen key={k} />}</Fresh>} />
            <Route path="debts/owed/:id" element={<DebtDetailScreen />} />
            <Route path="debts/owed/:id/edit" element={<Fresh>{(k) => <DebtFormScreen key={k} />}</Fresh>} />
            <Route path="checks" element={<ChecksScreen />} />
            <Route path="checks/new" element={<Fresh>{(k) => <CheckFormScreen key={k} />}</Fresh>} />
            <Route path="checks/:id" element={<Fresh>{(k) => <CheckFormScreen key={k} />}</Fresh>} />
            <Route path="more" element={<MoreScreen />} />
            <Route path="settings" element={<SettingsScreen />} />
            <Route path="settings/categories" element={<CategoriesScreen />} />
            <Route path="settings/rules" element={<RulesScreen />} />
            <Route path="settings/institutions" element={<InstitutionsScreen />} />
            <Route path="import" element={<ImportScreen />} />
            <Route path="reports" element={<ReportsScreen />} />
            <Route path="*" element={<HomeScreen />} />
          </Route>
        </Routes>
        <PinLock />
        <UpdateBanner />
      </ToastProvider>
    </BrowserRouter>
  );
}
