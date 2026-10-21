import { Settings } from 'lucide-react';
import { IconButton } from '../components/Button';
import { Money } from '../components/Money';
import { weekdayName } from '../game/demand';
import { useGame } from './GameProvider';

export function AppHeader({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { game } = useGame();
  const statusLabel = game.status === 'bankrupt' ? 'Muflis' : game.phase === 'prep' ? 'Persediaan' : 'Ditutup';
  const statusDot = game.status === 'bankrupt' ? 'bg-rust-600' : game.phase === 'prep' ? 'bg-sage-600' : 'bg-caramel-500';
  return (
    <header className="pt-safe sticky top-0 z-20 border-b border-espresso-800/[0.07] bg-cream-100/90 backdrop-blur-md">
      <div className="flex h-16 items-center gap-2 px-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-espresso-800 font-display text-lg text-cream-50" aria-hidden="true">
          {game.cafeName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[17px] leading-tight text-espresso-800">{game.cafeName}</p>
          <p className="flex items-center gap-1.5 whitespace-nowrap text-xs text-espresso-600">
            <span className={`size-2 shrink-0 rounded-full ${statusDot}`} aria-hidden="true" />
            <span className="truncate">
              Hari {game.day} · {weekdayName(game.day)}
              <span className="sr-only"> · {statusLabel}</span>
            </span>
          </p>
        </div>
        <div className="text-right" aria-label="Baki tunai">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-espresso-600">Tunai</p>
          <Money sen={game.cashSen} className={`text-base font-semibold ${game.cashSen < 0 ? 'text-rust-700' : 'text-espresso-800'}`} />
        </div>
        <IconButton label="Tetapan & simpanan" onClick={onOpenSettings} className="-mr-2">
          <Settings className="size-5" aria-hidden="true" />
        </IconButton>
      </div>
    </header>
  );
}
