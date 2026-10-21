import { Coffee, RefreshCw } from 'lucide-react';
import { Button } from '../components/Button';
import { useEffect, useState } from 'react';
import { Toast } from '../components/Toast';
import { BusinessScreen } from '../features/business/BusinessScreen';
import { DashboardScreen } from '../features/dashboard/DashboardScreen';
import { FinanceScreen } from '../features/finance/FinanceScreen';
import { MenuScreen } from '../features/menu/MenuScreen';
import { OperationsScreen } from '../features/operations/OperationsScreen';
import { GameOverDialog } from '../features/settings/GameOverDialog';
import { SettingsSheet } from '../features/settings/SettingsSheet';
import { AppHeader } from './AppHeader';
import { BottomNav } from './BottomNav';
import { GameProvider, useGame } from './GameProvider';
import { GlobalNotices } from './GlobalNotices';
import { NavProvider, useNav } from './navigation';

export function App() {
  return (
    <GameProvider>
      <NavProvider>
        <Shell />
      </NavProvider>
    </GameProvider>
  );
}

function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-espresso-700" role="status" aria-live="polite">
      <span className="inline-flex size-14 animate-pulse items-center justify-center rounded-2xl bg-espresso-800 text-cream-50">
        <Coffee className="size-7" aria-hidden="true" />
      </span>
      <p className="font-display text-lg">Memuatkan kafe anda…</p>
    </div>
  );
}

/** Shown instead of the game when the stored save was written by a newer version. */
function OutdatedScreen() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center text-espresso-800">
      <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-espresso-800 text-cream-50">
        <Coffee className="size-7" aria-hidden="true" />
      </span>
      <h1 className="font-display text-2xl">Versi permainan ini sudah lama</h1>
      <p className="text-[15px] text-espresso-700">
        Kemajuan anda disimpan oleh versi Café Empire yang lebih baharu. Muat semula halaman untuk mendapatkan versi terkini — kemajuan anda
        selamat dan tidak diubah.
      </p>
      <p className="text-sm text-espresso-600">Jika anda di luar talian, sambung ke internet dahulu.</p>
      <Button size="lg" onClick={() => window.location.reload()} icon={<RefreshCw className="size-5" aria-hidden="true" />}>
        Muat semula
      </Button>
    </main>
  );
}

function Shell() {
  const { boot, store, dispatch, outdated } = useGame();
  const { tab } = useNav();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Leaving Operasi during the day replay counts as skipping it, so returning shows the report.
  useEffect(() => {
    if (tab !== 'operasi' && store.justSettledDay !== null) dispatch({ type: 'PLAYBACK_DONE' });
  }, [tab, store.justSettledDay, dispatch]);

  if (boot === 'loading') return <Splash />;
  if (outdated) return <OutdatedScreen />;

  return (
    <div className="mx-auto min-h-dvh w-full max-w-md">
      <AppHeader onOpenSettings={() => setSettingsOpen(true)} />
      <main className="space-y-4 px-4 pb-[calc(104px+env(safe-area-inset-bottom,0px))] pt-3">
        <GlobalNotices onOpenSettings={() => setSettingsOpen(true)} />
        {tab === 'utama' && <DashboardScreen />}
        {tab === 'operasi' && <OperationsScreen />}
        {tab === 'menu' && <MenuScreen />}
        {tab === 'urus' && <BusinessScreen />}
        {tab === 'kewangan' && <FinanceScreen />}
      </main>
      <BottomNav />
      <Toast />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <GameOverDialog />
    </div>
  );
}
