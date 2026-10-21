import { BadgeCheck, Lock, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useGame } from '../../app/GameProvider';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Money } from '../../components/Money';
import { levelInfo } from '../../game/objectives';
import { upgradeViews, type UpgradeView } from '../../game/selectors';

export function UpgradesPanel({ locked }: { locked: boolean }) {
  const { game, dispatch } = useGame();
  const views = upgradeViews(game);
  const level = levelInfo(game);
  const [target, setTarget] = useState<UpgradeView | null>(null);

  return (
    <div className="space-y-3">
      <p className="px-1 text-sm text-espresso-600">
        Naik taraf ialah pelaburan modal: tunai berkurang serta-merta tetapi tidak dicatat sebagai perbelanjaan harian. Tahap kafe anda: {level.current.level} (
        {level.current.title}).
      </p>
      {views.map((u) => (
        <Card key={u.id} className={u.owned ? 'border-sage-600/30 bg-sage-50' : ''}>
          <div className="flex items-start gap-3">
            <span
              className={`inline-flex size-11 shrink-0 items-center justify-center rounded-xl ${u.owned ? 'bg-sage-700 text-white' : u.locked ? 'bg-cream-200 text-espresso-500' : 'bg-caramel-100 text-espresso-700'}`}
              aria-hidden="true"
            >
              {u.owned ? <BadgeCheck className="size-5" /> : u.locked ? <Lock className="size-5" /> : <Wrench className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-display text-lg leading-tight">{u.name}</h2>
                {u.owned ? <Badge tone="good">Dimiliki</Badge> : u.locked ? <Badge>Tahap {u.minLevel}</Badge> : null}
              </div>
              <p className="mt-0.5 text-sm text-espresso-600">{u.description}</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {u.effectSummary.map((e) => (
                  <li key={e}>
                    <Badge tone="info">{e}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {!u.owned ? (
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-lg font-semibold">
                <Money sen={u.costSen} trimZeroSen tabular={false} />
              </p>
              <Button
                variant="primary"
                disabled={locked || u.locked || !u.affordable}
                onClick={() => setTarget(u)}
              >
                {u.locked ? `Buka di Tahap ${u.minLevel}` : u.affordable ? 'Beli' : 'Tunai tak cukup'}
              </Button>
            </div>
          ) : null}
        </Card>
      ))}

      <ConfirmDialog
        open={target !== null}
        title={`Beli ${target?.name ?? ''}?`}
        confirmLabel="Beli naik taraf"
        onCancel={() => setTarget(null)}
        onConfirm={() => {
          if (target) dispatch({ type: 'BUY_UPGRADE', upgradeId: target.id });
          setTarget(null);
        }}
      >
        {target ? (
          <>
            <p>
              <Money sen={target.costSen} /> akan ditolak daripada tunai anda serta-merta. Baki tunai semasa: <Money sen={game.cashSen} />.
            </p>
            <p className="mt-2 text-sm text-espresso-600">Naik taraf adalah kekal dan tidak boleh dijual semula.</p>
          </>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
