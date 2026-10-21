import { Coffee, Croissant, CupSoda, GlassWater, Milk } from 'lucide-react';
import type { ProductId } from '../game/types';

const STYLE: Record<ProductId, { bg: string; fg: string; Icon: typeof Coffee }> = {
  kopi_o: { bg: 'bg-espresso-800', fg: 'text-cream-50', Icon: Coffee },
  americano: { bg: 'bg-espresso-600', fg: 'text-cream-50', Icon: GlassWater },
  latte: { bg: 'bg-caramel-200', fg: 'text-espresso-800', Icon: Milk },
  teh_ais: { bg: 'bg-caramel-500', fg: 'text-white', Icon: CupSoda },
  croissant: { bg: 'bg-honey-100', fg: 'text-honey-700', Icon: Croissant },
};

export function ProductIcon({ id, size = 'md' }: { id: ProductId; size?: 'sm' | 'md' }) {
  const s = STYLE[id];
  const box = size === 'sm' ? 'size-8 rounded-lg' : 'size-11 rounded-xl';
  const icon = size === 'sm' ? 'size-4' : 'size-5';
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${box} ${s.bg} ${s.fg}`} aria-hidden="true">
      <s.Icon className={icon} strokeWidth={2} />
    </span>
  );
}
