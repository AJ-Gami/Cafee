import { useState } from 'react';
import { useGame } from '../../app/GameProvider';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Modal';
import { Money } from '../../components/Money';

/** Shown when the café goes bankrupt. Players can still browse their reports afterwards. */
export function GameOverDialog() {
  const { game, resetGame } = useGame();
  const [dismissedDay, setDismissedDay] = useState<number | null>(null);
  const open = game.status === 'bankrupt' && dismissedDay !== game.day;

  return (
    <Dialog open={open} onClose={() => setDismissedDay(game.day)} title="Kafe anda muflis" role="alertdialog">
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
        <Button variant="accent" block onClick={resetGame}>
          Mulakan kafe baharu
        </Button>
        <Button variant="secondary" block onClick={() => setDismissedDay(game.day)}>
          Lihat laporan dahulu
        </Button>
      </div>
    </Dialog>
  );
}
