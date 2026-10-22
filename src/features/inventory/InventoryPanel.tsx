import { Minus, PackageCheck, Plus, ShoppingCart, Sparkles } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useGame } from '../../app/GameProvider';
import { Badge, type Tone } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card, CardTitle } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Money } from '../../components/Money';
import { IngredientIcon } from '../../components/IngredientIcon';
import { ProductIcon } from '../../components/ProductIcon';
import { BULK_DISCOUNTS } from '../../game/constants';
import { INGREDIENTS } from '../../game/data/ingredients';
import { PRODUCTS } from '../../game/data/products';
import { quotePurchase } from '../../game/economy';
import {
  currentInventoryValue,
  ingredientViews,
  productViews,
  restockPlan,
  type IngredientView,
  type StockLevel,
} from '../../game/selectors';

const LEVEL: Record<StockLevel, { label: string; tone: Tone }> = {
  out: { label: 'Habis', tone: 'bad' },
  low: { label: 'Stok rendah', tone: 'warn' },
  ok: { label: 'Mencukupi', tone: 'good' },
  off: { label: 'Tidak digunakan', tone: 'neutral' },
};

const PRODUCT_LEVEL: Record<StockLevel, { label: string; tone: Tone }> = {
  ...LEVEL,
  low: { label: 'Mungkin tak cukup', tone: 'warn' },
  off: { label: 'Tiada dalam menu', tone: 'neutral' },
};

const QUICK_QTY = [10, 25, 50, 100] as const;

export function InventoryPanel({ locked }: { locked: boolean }) {
  const { game, dispatch } = useGame();
  const views = useMemo(() => ingredientViews(game), [game]);
  const products = useMemo(() => productViews(game), [game]);
  const plan = useMemo(() => restockPlan(game), [game]);
  const [restockOpen, setRestockOpen] = useState(false);
  const canAffordPlan = plan.totalSen <= game.cashSen;

  return (
    <div className="space-y-3">
      <Card>
        <CardTitle title="Ringkasan stok" icon={<PackageCheck className="size-5" />} />
        <dl className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-cream-100 p-3">
            <dt className="text-xs font-semibold uppercase text-espresso-600">Tunai</dt>
            <dd className="mt-0.5 text-lg font-semibold">
              <Money sen={game.cashSen} tabular={false} />
            </dd>
          </div>
          <div className="rounded-xl bg-cream-100 p-3">
            <dt className="text-xs font-semibold uppercase text-espresso-600">Nilai inventori</dt>
            <dd className="mt-0.5 text-lg font-semibold">
              <Money sen={currentInventoryValue(game)} tabular={false} />
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-espresso-600">
          Kafe menyimpan bahan, bukan minuman siap: setiap produk dibuat daripada bahan mengikut resipinya, dan bahan yang dikongsi (susu, biji
          kopi) habis lebih cepat. Belian stok mengurangkan tunai serta-merta; kos bahan hanya menjadi kos barang dijual apabila produk terjual.
          Diskaun pukal:{' '}
          {BULK_DISCOUNTS.map((t) => `${t.minQty}+ unit ${t.bps / 100}%`)
            .reverse()
            .join(', ')}
          .
        </p>
        <Button
          className="mt-3"
          variant="accent"
          block
          disabled={locked || plan.items.length === 0}
          onClick={() => setRestockOpen(true)}
          icon={<Sparkles className="size-4" aria-hidden="true" />}
        >
          {plan.items.length === 0 ? 'Stok sudah ikut anggaran' : <>Isi semula ikut anggaran (<Money sen={plan.totalSen} />)</>}
        </Button>
      </Card>

      <Card>
        <CardTitle title="Hidangan boleh dibuat" subtitle="Daripada bahan sekarang, jika produk lain tidak berkongsi bahan." />
        <ul className="divide-y divide-espresso-800/[0.07]">
          {products.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <ProductIcon id={p.id} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{p.name}</span>
                <span className="block text-xs text-espresso-600">
                  {p.recipe.map((r) => `${r.qty} ${r.name.toLowerCase()}`).join(' + ')}
                  {p.enabled ? ` · anggaran ~${p.estimatedDemand}` : ''}
                </span>
              </span>
              <span className="text-right">
                <span className="tabular block font-semibold">
                  {p.servings} {PRODUCTS[p.id].unitLabel}
                </span>
                <Badge tone={PRODUCT_LEVEL[p.stockLevel].tone}>{PRODUCT_LEVEL[p.stockLevel].label}</Badge>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {views.map((v) => (
        <PurchaseCard key={v.id} view={v} locked={locked} />
      ))}

      <ConfirmDialog
        open={restockOpen}
        title="Isi semula stok?"
        confirmLabel={canAffordPlan ? 'Beli semua' : 'Tunai tidak mencukupi'}
        confirmDisabled={!canAffordPlan}
        tone="accent"
        onCancel={() => setRestockOpen(false)}
        onConfirm={() => {
          setRestockOpen(false);
          dispatch({ type: 'PURCHASE_BATCH', items: plan.items });
        }}
      >
        <p>Beli stok untuk memenuhi anggaran permintaan hari ini:</p>
        <ul className="mt-2 space-y-1">
          {plan.items.map((i) => (
            <li key={i.ingredientId} className="flex justify-between gap-2">
              <span>
                {INGREDIENTS[i.ingredientId].name} × {i.quantity}
              </span>
              <Money sen={quotePurchase(game, i.ingredientId, i.quantity).totalSen} />
            </li>
          ))}
        </ul>
        <p className="mt-2 flex justify-between border-t border-espresso-800/10 pt-2 font-semibold">
          <span>Jumlah</span>
          <Money sen={plan.totalSen} />
        </p>
        {!canAffordPlan ? (
          <p className="mt-2 text-sm font-semibold text-rust-700">
            Tunai anda (<Money sen={game.cashSen} />) tidak mencukupi. Beli bahan satu demi satu.
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}

function PurchaseCard({ view, locked }: { view: IngredientView; locked: boolean }) {
  const { game, dispatch } = useGame();
  const qtyId = useId();
  const [qty, setQty] = useState<number>(Math.max(10, view.suggestedPurchase || 10));
  const max = view.maxPurchase;
  const safeQty = Math.min(Math.max(1, qty || 1), Math.max(1, max));
  const quote = quotePurchase(game, view.id, safeQty);
  const affordable = quote.totalSen <= game.cashSen;
  const storageFull = max === 0;
  const level = LEVEL[view.stockLevel];

  return (
    <Card>
      <div className="flex items-start gap-3">
        <IngredientIcon id={view.id} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg leading-tight">{view.name}</h2>
            <Badge tone={level.tone}>{level.label}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-espresso-600">
            Keperluan anggaran hari ini: <span className="font-semibold text-espresso-800">~{view.estimatedNeed}</span> {view.unitLabel}
          </p>
          <p className="mt-0.5 text-xs text-espresso-600">
            Untuk {view.usedBy.map((u) => `${u.name} (${u.qty})`).join(', ')}
          </p>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-xl bg-cream-100 p-2">
          <dt className="text-[11px] font-semibold uppercase text-espresso-600">Stok</dt>
          <dd className={`text-lg font-semibold ${view.stock === 0 ? 'text-rust-700' : ''}`}>{view.stock}</dd>
        </div>
        <div className="rounded-xl bg-cream-100 p-2">
          <dt className="text-[11px] font-semibold uppercase text-espresso-600">Kos purata</dt>
          <dd className="font-semibold">{view.stock > 0 ? <Money sen={view.avgCostSen} /> : '—'}</dd>
        </div>
        <div className="rounded-xl bg-cream-100 p-2">
          <dt className="text-[11px] font-semibold uppercase text-espresso-600">Nilai</dt>
          <dd className="font-semibold">
            <Money sen={view.stockValueSen} />
          </dd>
        </div>
      </dl>

      {view.spoilageRate > 0 ? (
        <p className="mt-2 text-xs text-honey-700">
          Mudah rosak: kira-kira {Math.round(view.spoilageRate * 100)}% baki stok dibuang setiap malam.
        </p>
      ) : null}

      <fieldset className="mt-3" disabled={locked || storageFull}>
        <legend className="text-xs font-semibold uppercase tracking-wide text-espresso-600">Kuantiti belian</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {QUICK_QTY.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setQty(q)}
              aria-pressed={safeQty === q}
              className={`min-h-11 min-w-12 rounded-xl border px-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
                safeQty === q ? 'border-espresso-800 bg-espresso-800 text-cream-50' : 'border-espresso-800/15 bg-cream-50 text-espresso-800 hover:bg-cream-100'
              }`}
            >
              {q}
            </button>
          ))}
          {view.suggestedPurchase > 0 && !QUICK_QTY.includes(view.suggestedPurchase as (typeof QUICK_QTY)[number]) ? (
            <button
              type="button"
              onClick={() => setQty(view.suggestedPurchase)}
              aria-pressed={safeQty === view.suggestedPurchase}
              className={`min-h-11 rounded-xl border px-3 text-sm font-semibold ${
                safeQty === view.suggestedPurchase ? 'border-sage-700 bg-sage-700 text-white' : 'border-sage-600/40 bg-sage-50 text-sage-800'
              }`}
            >
              Cadangan {view.suggestedPurchase}
            </button>
          ) : null}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Button variant="secondary" className="w-11 px-0" aria-label={`Kurangkan kuantiti ${view.name}`} onClick={() => setQty(Math.max(1, safeQty - 5))}>
            <Minus className="size-4" aria-hidden="true" />
          </Button>
          <label htmlFor={qtyId} className="sr-only">
            Kuantiti {view.name}
          </label>
          <input
            id={qtyId}
            type="number"
            inputMode="numeric"
            min={1}
            max={Math.max(1, max)}
            value={qty || ''}
            onChange={(e) => setQty(Math.floor(Number(e.target.value)))}
            className="tabular min-h-11 w-full min-w-0 flex-1 rounded-xl border border-espresso-800/20 bg-white px-3 text-center text-lg font-semibold disabled:bg-cream-100"
          />
          <Button variant="secondary" className="w-11 px-0" aria-label={`Tambah kuantiti ${view.name}`} onClick={() => setQty(Math.min(Math.max(1, max), safeQty + 5))}>
            <Plus className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </fieldset>

      <div className="mt-3 rounded-xl bg-cream-100 p-3 text-sm">
        <div className="flex justify-between gap-2">
          <span>
            {quote.quantity} × <Money sen={quote.unitCostSen} />
            {quote.surchargeBps !== 10_000 ? <span className="ml-1 font-semibold text-honey-700">(harga naik hari ini)</span> : null}
          </span>
          <Money sen={quote.subtotalSen} />
        </div>
        {quote.discountSen > 0 ? (
          <div className="flex justify-between gap-2 text-sage-700">
            <span>Diskaun pukal {quote.discountBps / 100}%</span>
            <Money sen={-quote.discountSen} />
          </div>
        ) : null}
        <div className="mt-1 flex justify-between gap-2 border-t border-espresso-800/10 pt-1 font-semibold">
          <span>Jumlah</span>
          <Money sen={quote.totalSen} />
        </div>
      </div>

      {storageFull ? (
        <p className="mt-2 text-sm font-semibold text-honey-700">Stor penuh untuk bahan ini.</p>
      ) : !affordable && !locked ? (
        <p className="mt-2 text-sm font-semibold text-rust-700" role="status">
          Tunai tidak mencukupi — perlu <Money sen={quote.totalSen} />, baki <Money sen={game.cashSen} />.
        </p>
      ) : null}

      <Button
        className="mt-3"
        block
        disabled={locked || storageFull || !affordable || safeQty < 1}
        onClick={() => dispatch({ type: 'PURCHASE', ingredientId: view.id, quantity: safeQty })}
        icon={<ShoppingCart className="size-4" aria-hidden="true" />}
      >
        Beli {safeQty} {view.unitLabel}
      </Button>
    </Card>
  );
}
