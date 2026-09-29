import { useState } from 'react';
import { BrowserRouter, Outlet, Route, Routes } from 'react-router';
import { BottomNav } from './components/BottomNav';
import { QuickAddSheet } from './screens/QuickAddSheet';
import { HomeScreen } from './screens/HomeScreen';
import { TransactionsScreen } from './screens/TransactionsScreen';
import { PlanScreen } from './screens/PlanScreen';
import { MoreScreen } from './screens/MoreScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ComingSoonScreen } from './screens/ComingSoonScreen';
import { useApplyTheme, useSettings } from './hooks';

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
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomeScreen />} />
          <Route path="transactions" element={<TransactionsScreen />} />
          <Route path="plan" element={<PlanScreen />} />
          <Route path="more" element={<MoreScreen />} />
          <Route path="settings" element={<SettingsScreen />} />
          <Route path="soon/:module" element={<ComingSoonScreen />} />
          <Route path="*" element={<HomeScreen />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
