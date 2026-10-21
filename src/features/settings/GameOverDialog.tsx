import { useState } from 'react';
import { useGame } from '../../app/GameProvider';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Dialog } from '../../components/Modal';
import { Money } from '../../components/Money';

/** Shown when the café goes bankrupt. Players can still browse their reports afterwards. */
export function GameOverDialog() {
  const { game, resetGame } = useGame();
  // Dismissal is tied to this particular game and day, so a later bankruptcy always shows the dialog again.
  const gameKey = `${game.seed}:${game.day}`;
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const open = game.status === 'bankrupt' && dismissedKey !== gameKey;

  return (
    <>
      <Dialog open={open && !confirmRestart} onClose={() => setDismissedKey(gameKey)} title="Kafe anda muflis" role="alertdialog">
        <p className="mt-2 text-espresso-700">
          Baki tunai kekal negatif selama 3 hari berturut-turut. {game.cafeName} terpaksa ditutup selepas {game.stats.daysCompleted} hari beroperasi.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-cream-100 p-2.5">
            <dt className="text-xs text-espresso-600">Jumlah hasil</dt>
            <dd className="font-semibold">
              <Money sen={game.stats.totalRevenueSen} />
            </dd>
          </div>
          <div className="rounded-xl bg-cream-100 p-2.5">
            <dt className="text-xs text-espresso-600">Pelanggan dilayan</dt>
            <dd className="font-semibold">{game.stats.totalServed}</dd>
          </div>
        </dl>
        <div className="mt-5 flex flex-col gap-2">
          <Button variant="secondary" block onClick={() => setDismissedKey(gameKey)} data-autofocus>
            Lihat laporan dahulu
          </Button>
          <Button variant="accent" block onClick={() => setConfirmRestart(true)}>
            Mulakan kafe baharu
          </Button>
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirmRestart}
        title="Padam dan mula semula?"
        confirmLabel="Ya, mula kafe baharu"
        tone="danger"
        onCancel={() => setConfirmRestart(false)}
        onConfirm={() => {
          setConfirmRestart(false);
          setDismissedKey(null);
          resetGame();
        }}
      >
        <p>Semua laporan dan kemajuan {game.cafeName} akan dipadam daripada pelayar ini. Tindakan ini tidak boleh dibatalkan.</p>
      </ConfirmDialog>
    </>
  );
}
