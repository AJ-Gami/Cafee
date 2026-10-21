import { Check, Lock, Megaphone } from 'lucide-react';
import { useGame } from '../../app/GameProvider';
import { Card, CardTitle } from '../../components/Card';
import { Money } from '../../components/Money';
import { promotionViews } from '../../game/selectors';

export function PromotionPicker() {
  const { game, dispatch } = useGame();
  const options = promotionViews(game);
  return (
    <Card>
      <CardTitle title="Promosi hari ini" subtitle="Kos pemasaran dibayar ketika kafe dibuka." icon={<Megaphone className="size-5" />} />
      <div role="radiogroup" aria-label="Pilih promosi" className="space-y-2">
        {options.map((o) => {
          const disabled = o.locked || (!o.affordable && !o.selected);
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={o.selected}
              disabled={disabled}
              onClick={() => dispatch({ type: 'SET_PROMOTION', promotionId: o.id })}
              className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed ${
                o.selected
                  ? 'border-sage-600 bg-sage-50 ring-1 ring-sage-600'
                  : disabled
                    ? 'border-dashed border-espresso-800/20 bg-cream-100'
                    : 'border-espresso-800/10 bg-cream-50 hover:bg-cream-100'
              }`}
            >
              <span
                className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                  o.selected ? 'border-sage-600 bg-sage-600 text-white' : 'border-espresso-500/50'
                }`}
                aria-hidden="true"
              >
                {o.selected ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-espresso-800">{o.name}</span>
                  <span className="shrink-0 text-sm font-semibold text-espresso-700">
                    {o.costSen > 0 ? <Money sen={o.costSen} trimZeroSen /> : 'Percuma'}
                  </span>
                </span>
                <span className="mt-0.5 block text-sm text-espresso-600">{o.description}</span>
                {o.locked ? (
                  <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-espresso-600">
                    <Lock className="size-3" aria-hidden="true" /> Dibuka pada Tahap {o.minLevel}
                  </span>
                ) : !o.affordable ? (
                  <span className="mt-1 block text-xs font-semibold text-rust-700">Tunai tidak mencukupi</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
