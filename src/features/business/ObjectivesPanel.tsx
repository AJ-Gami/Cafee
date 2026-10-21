import { CircleCheck, Target, Trophy } from 'lucide-react';
import { useGame } from '../../app/GameProvider';
import { Badge } from '../../components/Badge';
import { Card, CardTitle } from '../../components/Card';
import { ProgressBar } from '../../components/ProgressBar';
import { LEVELS } from '../../game/data/objectives';
import { formatRM } from '../../game/money';
import { levelInfo } from '../../game/objectives';
import { objectiveViews, type ObjectiveView } from '../../game/selectors';

function formatProgress(o: ObjectiveView): string {
  if (o.unit === 'sen') return `${formatRM(o.current, { trimZeroSen: true })} / ${formatRM(o.target, { trimZeroSen: true })}`;
  if (o.unit === 'points') return `${Math.floor(o.current)} / ${o.target}`;
  return `${o.current.toLocaleString('en-MY')} / ${o.target.toLocaleString('en-MY')}`;
}

export function ObjectivesPanel() {
  const { game } = useGame();
  const level = levelInfo(game);
  const objectives = objectiveViews(game);
  const done = objectives.filter((o) => o.complete).length;

  return (
    <div className="space-y-3">
      <Card className="bg-espresso-800 text-cream-50">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-caramel-500 text-white" aria-hidden="true">
            <Trophy className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-cream-200">Tahap {level.current.level}</p>
            <p className="font-display text-2xl leading-tight text-white">{level.current.title}</p>
          </div>
          <p className="text-right text-sm">
            <span className="block text-xl font-semibold">{level.xp}</span>XP
          </p>
        </div>
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/20" role="progressbar" aria-label="Kemajuan ke tahap seterusnya" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level.progress * 100)}>
            <div className="h-full rounded-full bg-caramel-200" style={{ width: `${Math.round(level.progress * 100)}%` }} />
          </div>
          <p className="mt-1.5 text-sm text-cream-200">
            {level.next ? `${level.next.minXp - level.xp} XP lagi ke Tahap ${level.next.level} (${level.next.title})` : 'Tahap tertinggi dicapai!'}
          </p>
        </div>
        <ul className="mt-3 grid grid-cols-4 gap-1.5 text-center text-[11px]">
          {LEVELS.map((l) => (
            <li key={l.level} className={`rounded-lg px-1 py-1.5 ${l.level <= level.current.level ? 'bg-white/15 text-white' : 'text-cream-200/80'}`}>
              <span className="block font-semibold">T{l.level}</span>
              {l.minXp} XP
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardTitle title="Objektif" subtitle={`${done} daripada ${objectives.length} dicapai. Tahap lebih tinggi membuka naik taraf dan promosi baharu.`} icon={<Target className="size-5" />} />
        <ul className="space-y-4">
          {objectives.map((o) => (
            <li key={o.id} className={o.complete ? 'opacity-75' : ''}>
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-1.5 font-semibold">
                  {o.complete ? <CircleCheck className="size-4 text-sage-700" aria-label="Selesai" /> : null}
                  {o.title}
                </p>
                <Badge tone={o.complete ? 'good' : 'info'}>+{o.xp} XP</Badge>
              </div>
              <p className="text-sm text-espresso-600">{o.description}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <ProgressBar value={o.current} max={o.target} label={`Kemajuan ${o.title}`} tone={o.complete ? 'sage' : 'caramel'} />
                <span className="tabular shrink-0 text-xs text-espresso-600">{formatProgress(o)}</span>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
