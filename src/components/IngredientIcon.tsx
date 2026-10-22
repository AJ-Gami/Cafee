import { Bean, Croissant, Leaf, Milk } from 'lucide-react';
import type { IngredientId } from '../game/types';

const STYLE: Record<IngredientId, { bg: string; fg: string; Icon: typeof Bean }> = {
  kopi: { bg: 'bg-espresso-800', fg: 'text-cream-50', Icon: Bean },
  susu: { bg: 'bg-cream-200', fg: 'text-espresso-800', Icon: Milk },
  teh: { bg: 'bg-caramel-500', fg: 'text-white', Icon: Leaf },
  pastri: { bg: 'bg-honey-100', fg: 'text-honey-700', Icon: Croissant },
};

export function IngredientIcon({ id, size = 'md' }: { id: IngredientId; size?: 'sm' | 'md' }) {
  const s = STYLE[id];
  const box = size === 'sm' ? 'size-8 rounded-lg' : 'size-11 rounded-xl';
  const icon = size === 'sm' ? 'size-4' : 'size-5';
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${box} ${s.bg} ${s.fg}`} aria-hidden="true">
      <s.Icon className={icon} strokeWidth={2} />
    </span>
  );
}
