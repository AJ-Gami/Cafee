import { ChartColumn, Coffee, House, Store, Users } from 'lucide-react';
import { useMemo } from 'react';
import { productViews } from '../game/selectors';
import { useGame } from './GameProvider';
import { useNav, type TabId } from './navigation';

const ITEMS: { id: TabId; label: string; Icon: typeof House }[] = [
  { id: 'utama', label: 'Utama', Icon: House },
  { id: 'operasi', label: 'Operasi', Icon: Store },
  { id: 'menu', label: 'Menu', Icon: Coffee },
  { id: 'urus', label: 'Urus', Icon: Users },
  { id: 'kewangan', label: 'Kewangan', Icon: ChartColumn },
];

export function BottomNav() {
  const { tab, go } = useNav();
  const { game } = useGame();
  const stockAlerts = useMemo(
    () => (game.phase === 'prep' ? productViews(game).filter((v) => v.stockLevel === 'out').length : 0),
    [game],
  );
  const reportReady = game.phase === 'closed';

  return (
    <nav aria-label="Navigasi utama" className="fixed inset-x-0 bottom-0 z-30 border-t border-espresso-800/10 bg-cream-50/95 backdrop-blur-md pb-safe">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {ITEMS.map(({ id, label, Icon }) => {
          const active = tab === id;
          const badge = id === 'menu' && stockAlerts > 0 ? stockAlerts : null;
          const dot = id === 'operasi' && reportReady;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => go(id)}
                aria-current={active ? 'page' : undefined}
                className="relative flex min-h-16 w-full flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold"
              >
                <span
                  className={`relative inline-flex h-8 w-14 items-center justify-center rounded-full transition-colors ${
                    active ? 'bg-espresso-800 text-cream-50' : 'text-espresso-600'
                  }`}
                >
                  <Icon className="size-5" aria-hidden="true" />
                  {badge ? (
                    <span className="absolute -right-0.5 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-rust-600 px-1 text-[10px] leading-5 text-white">
                      {badge}
                      <span className="sr-only"> produk habis stok</span>
                    </span>
                  ) : null}
                  {dot ? (
                    <span className="absolute right-2.5 top-1 size-2.5 rounded-full bg-caramel-500 ring-2 ring-cream-50">
                      <span className="sr-only">Laporan sedia</span>
                    </span>
                  ) : null}
                </span>
                <span className={`leading-none ${active ? 'text-espresso-800' : 'text-espresso-600'}`}>{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
