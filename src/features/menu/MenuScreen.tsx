import { useMemo } from 'react';
import { useGame } from '../../app/GameProvider';
import { useNav } from '../../app/navigation';
import { ScreenTitle } from '../../components/Card';
import { Notice } from '../../components/Notice';
import { Segmented } from '../../components/Segmented';
import { productViews } from '../../game/selectors';
import { InventoryPanel } from '../inventory/InventoryPanel';
import { MenuPanel } from './MenuPanel';

type MenuTab = 'harga' | 'inventori';

export function MenuScreen() {
  const { game } = useGame();
  const { sub, setSub } = useNav();
  const tab: MenuTab = sub === 'inventori' ? 'inventori' : 'harga';
  const outCount = useMemo(() => productViews(game).filter((v) => v.stockLevel === 'out').length, [game]);
  const locked = game.phase !== 'prep' || game.status !== 'active';

  return (
    <div className="space-y-4">
      <ScreenTitle title="Menu & Stok" subtitle="Tetapkan harga, pilih menu dan beli stok." />
      <Segmented<MenuTab>
        label="Bahagian menu"
        value={tab}
        onChange={setSub}
        options={[
          { id: 'harga', label: 'Menu & harga' },
          { id: 'inventori', label: 'Inventori', badge: game.phase === 'prep' ? outCount : null },
        ]}
      />
      {locked ? (
        <Notice tone="info" title="Kafe sudah ditutup untuk hari ini">
          Perubahan harga dan belian stok dibuka semula apabila anda memulakan hari seterusnya di skrin Operasi.
        </Notice>
      ) : null}
      <div role="tabpanel" aria-label={tab === 'harga' ? 'Menu & harga' : 'Inventori'}>
        {tab === 'harga' ? <MenuPanel locked={locked} /> : <InventoryPanel locked={locked} />}
      </div>
    </div>
  );
}
