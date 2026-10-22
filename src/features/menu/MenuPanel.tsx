import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useGame } from '../../app/GameProvider';
import { Badge, type Tone } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Money } from '../../components/Money';
import { ProductIcon } from '../../components/ProductIcon';
import { Switch } from '../../components/Switch';
import { MAX_PRICE_SEN, MIN_PRICE_SEN, PRICE_STEP_SEN } from '../../game/constants';
import { PRODUCTS } from '../../game/data/products';
import { parseRinggit, senToInput } from '../../game/money';
import { PRICE_PERCEPTION_LABEL, previewPrice, productViews, type PricePerception, type ProductView } from '../../game/selectors';

const PERCEPTION_TONE: Record<PricePerception, Tone> = {
  cheap: 'info',
  fair: 'good',
  pricey: 'warn',
  too_expensive: 'bad',
};

export function MenuPanel({ locked }: { locked: boolean }) {
  const { game } = useGame();
  const views = productViews(game);
  const enabledCount = views.filter((v) => v.enabled).length;
  return (
    <div className="space-y-3">
      <p className="px-1 text-sm text-espresso-600">
        {enabledCount} daripada {views.length} produk dalam menu hari ini. Harga melebihi harga pasaran mengurangkan pembeli dan reputasi.
      </p>
      {views.map((v) => (
        <ProductMenuCard key={v.id} view={v} locked={locked} />
      ))}
    </div>
  );
}

function ProductMenuCard({ view, locked }: { view: ProductView; locked: boolean }) {
  const { game, dispatch } = useGame();
  const inputId = useId();
  const errorId = useId();
  const def = PRODUCTS[view.id];
  const [text, setText] = useState(senToInput(view.priceSen));
  const [error, setError] = useState<string | null>(null);

  // Sync the draft when the saved price changes (e.g. after saving or loading).
  useEffect(() => {
    setText(senToInput(view.priceSen));
    setError(null);
  }, [view.priceSen]);

  const parsed = parseRinggit(text);
  const draftSen = parsed !== null && parsed >= MIN_PRICE_SEN && parsed <= MAX_PRICE_SEN ? parsed : null;
  const preview = previewPrice(game, view.id, draftSen ?? view.priceSen);
  const dirty = draftSen !== null && draftSen !== view.priceSen;

  const step = (delta: number) => {
    const base = draftSen ?? view.priceSen;
    const next = Math.min(MAX_PRICE_SEN, Math.max(MIN_PRICE_SEN, base + delta));
    setText(senToInput(next));
    setError(null);
  };

  const onTextChange = (value: string) => {
    setText(value);
    const p = parseRinggit(value);
    if (p === null) setError('Masukkan harga yang sah, contohnya 7.50');
    else if (p < MIN_PRICE_SEN || p > MAX_PRICE_SEN) setError(`Harga mesti antara RM${senToInput(MIN_PRICE_SEN)} dan RM${senToInput(MAX_PRICE_SEN)}`);
    else setError(null);
  };

  const save = () => {
    if (draftSen === null) return;
    dispatch({ type: 'SET_PRICE', productId: view.id, priceSen: draftSen });
  };

  return (
    <Card className={view.enabled ? '' : 'border-dashed bg-cream-100 shadow-none'}>
      <div className="flex items-start gap-3">
        <ProductIcon id={view.id} />
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 font-display text-lg leading-tight text-espresso-800">
            {view.name}
            {!view.enabled ? <Badge>Tiada dalam menu</Badge> : null}
          </h2>
          <p className="text-sm text-espresso-600">{def.description}</p>
          <p className="mt-0.5 text-xs text-espresso-600">Resipi: {view.recipe.map((r) => `${r.qty} ${r.unitLabel} ${r.name.toLowerCase()}`).join(' + ')}</p>
        </div>
        <Switch
          checked={view.enabled}
          disabled={locked}
          label={`${view.name} dalam menu`}
          onChange={(enabled) => dispatch({ type: 'SET_PRODUCT_ENABLED', productId: view.id, enabled })}
        />
      </div>

      <div className="mt-3">
        <label htmlFor={inputId} className="text-xs font-semibold uppercase tracking-wide text-espresso-600">
          Harga jualan<span className="sr-only"> {view.name}</span>
        </label>
        <div className="mt-1 flex items-center gap-2">
          <Button variant="secondary" aria-label={`Kurangkan harga ${view.name} 10 sen`} disabled={locked} onClick={() => step(-PRICE_STEP_SEN)} className="w-11 px-0">
            <Minus className="size-4" aria-hidden="true" />
          </Button>
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-espresso-600">RM</span>
            <input
              id={inputId}
              inputMode="decimal"
              autoComplete="off"
              value={text}
              disabled={locked}
              onChange={(e) => onTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && dirty) save();
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className="tabular min-h-11 w-full rounded-xl border border-espresso-800/20 bg-white pl-11 pr-3 text-lg font-semibold text-espresso-800 disabled:bg-cream-100"
            />
          </div>
          <Button variant="secondary" aria-label={`Naikkan harga ${view.name} 10 sen`} disabled={locked} onClick={() => step(PRICE_STEP_SEN)} className="w-11 px-0">
            <Plus className="size-4" aria-hidden="true" />
          </Button>
        </div>
        {error ? (
          <p id={errorId} className="mt-1 text-sm text-rust-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-xl bg-cream-100 p-2">
          <dt className="text-[11px] font-semibold uppercase text-espresso-600">Kos bahan</dt>
          <dd className="font-semibold">
            <Money sen={view.unitCostSen} />
            {view.costRaisedToday ? <span className="block text-[11px] font-semibold text-honey-700">naik hari ini</span> : null}
          </dd>
        </div>
        <div className="rounded-xl bg-cream-100 p-2">
          <dt className="text-[11px] font-semibold uppercase text-espresso-600">Margin</dt>
          <dd className={`font-semibold ${preview.marginSen < 0 ? 'text-rust-700' : ''}`}>
            <Money sen={preview.marginSen} />
          </dd>
        </div>
        <div className="rounded-xl bg-cream-100 p-2">
          <dt className="text-[11px] font-semibold uppercase text-espresso-600">Margin %</dt>
          <dd className="font-semibold">{preview.marginPct.toFixed(1)}%</dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone={PERCEPTION_TONE[preview.perception]}>{PRICE_PERCEPTION_LABEL[preview.perception]}</Badge>
        <span className="text-xs text-espresso-600">
          Harga pasaran ~<Money sen={preview.referencePriceSen} />
          {preview.salePriceSen !== preview.priceSen ? (
            <>
              {' '}
              · selepas diskaun <Money sen={preview.salePriceSen} />
            </>
          ) : null}
        </span>
      </div>

      {dirty ? (
        <div className="mt-3 flex gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setText(senToInput(view.priceSen));
              setError(null);
            }}
            icon={<RotateCcw className="size-4" aria-hidden="true" />}
          >
            Batal
          </Button>
          <Button variant="primary" block onClick={save} disabled={locked || error !== null}>
            Simpan harga <Money sen={draftSen ?? view.priceSen} />
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
