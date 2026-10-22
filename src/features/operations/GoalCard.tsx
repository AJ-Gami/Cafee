import { Target } from 'lucide-react';
import { useGame } from '../../app/GameProvider';
import { Card, CardTitle } from '../../components/Card';
import { Money } from '../../components/Money';
import { Notice } from '../../components/Notice';
import { weekdayName } from '../../game/demand';
import { goalRaisePercent } from '../../game/goals';
import { todayGoalView, weekendGoalsTomorrow } from '../../game/selectors';

/** Today's weekend or public-holiday sales goal while preparing; on Fridays, a heads-up for the weekend. */
export function GoalCard() {
  const { game } = useGame();
  const view = todayGoalView(game);

  if (view) {
    const { goal } = view;
    return (
      <Card className="border-sage-600/30 bg-sage-50">
        <CardTitle title={view.title} subtitle={`${weekdayName(game.day)} · ditetapkan pagi ini`} icon={<Target className="size-5" />} />
        <p className="text-3xl font-bold text-espresso-800">
          <Money sen={goal.targetSen} tabular={false} />
        </p>
        <p className="mt-1 text-sm text-espresso-700">
          Capai hasil jualan sekurang-kurangnya jumlah ini hari ini: purata jualan {goal.baseDays} hari lepas (<Money sen={goal.baseSen} />) +{' '}
          {view.raisePercent}%.
        </p>
        <p className="mt-2 text-sm text-espresso-600">Lebih ramai pelanggan dijangka — tambah stok dan staf, atau jalankan promosi.</p>
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
