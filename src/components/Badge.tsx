import type { ReactNode } from 'react';

export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info' | 'dark';

const TONES: Record<Tone, string> = {
  neutral: 'bg-cream-200 text-espresso-700',
  good: 'bg-sage-100 text-sage-800',
  warn: 'bg-honey-100 text-honey-700',
  bad: 'bg-rust-100 text-rust-700',
  info: 'bg-caramel-100 text-espresso-700',
  dark: 'bg-espresso-800 text-cream-50',
};

export function Badge({ tone = 'neutral', children, icon, className = '' }: { tone?: Tone; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TONES[tone]} ${className}`}>
      {icon}
      {children}
    </span>
  );
}
