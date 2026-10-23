import { Target } from 'lucide-react';
import { useGame } from '../../app/GameProvider';
import { Card, CardTitle } from '../../components/Card';
import { Money } from '../../components/Money';
import { Notice } from '../../components/Notice';
import { weekdayName } from '../../game/demand';
import { goalRaisePercent } from '../../game/goals';
import { revenueEstimate, todayGoalView, weekendGoalsTomorrow } from '../../game/selectors';

const LIMIT_HINT = {
  stock: 'Stok sekarang tidak cukup — beli lebih bahan.',
  capacity: 'Barisan akan panjang — tambah barista atau naik taraf kapasiti.',
} as const;

/** Today's weekend or public-holiday sales goal while preparing; on Fridays, a heads-up for the weekend. */
export function GoalCard() {
  const { game } = useGame();
  const view = todayGoalView(game);

  if (view) {
    const { goal } = view;
    const estimate = revenueEstimate(game);
    const enough = estimate.expectedSen >= goal.targetSen;
    return (
      <Card className="border-sage-600/30 bg-sage-50">
        <CardTitle title={view.title} subtitle={`${weekdayName(game.day)} · ditetapkan pagi ini`} icon={<Target className="size-5" />} />
        <p className="text-3xl font-bold text-espresso-800">
          <Money sen={goal.targetSen} tabular={false} />
        </p>
        <p className="mt-1 text-sm text-espresso-700">
          Capai hasil jualan sekurang-kurangnya jumlah ini hari ini: purata jualan {game.branches.length > 0 ? 'kafe utama ' : ''}
          {goal.baseDays} hari lepas (<Money sen={goal.baseSen} />) +{view.raisePercent}%
          {game.branches.length > 0 ? ', ditambah jualan biasa cawangan pada hari seperti ini' : ''}.
        </p>
        <div className={`mt-3 rounded-xl p-3 text-sm ${enough ? 'bg-cream-50 text-espresso-700' : 'bg-honey-100 text-honey-700'}`}>
          <p>
            Anggaran jualan hari ini: <span className="font-semibold">~<Money sen={estimate.expectedSen} /></span>
            {enough ? ' — cukup untuk sasaran.' : ' — belum cukup untuk sasaran.'}
          </p>
          {estimate.limitedBy ? (
            <p className="mt-0.5">
              {LIMIT_HINT[estimate.limitedBy]} Tanpa had itu: ~<Money sen={estimate.demandSen} />.
            </p>
          ) : !enough ? (
            <p className="mt-0.5">Jalankan promosi untuk menarik lebih ramai pelanggan.</p>
          ) : null}
        </div>
      </Card>
    );
  }

  if (weekendGoalsTomorrow(game)) {
    return (
      <Notice tone="info" title="Esok hujung minggu">
        Sabtu dan Ahad ada sasaran jualan: purata jualan harian terkini + {goalRaisePercent('weekend')}% (+{goalRaisePercent('holiday')}% jika cuti
        umum). Rancang stok, staf dan promosi lebih awal.
      </Notice>
    );
  }

  return null;
}
