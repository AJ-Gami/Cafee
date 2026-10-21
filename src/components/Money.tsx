import { formatRM } from '../game/money';

/** Renders an integer-sen amount as ringgit. Formatting only — never arithmetic. */
export function Money({
  sen,
  signed = false,
  colored = false,
  trimZeroSen = false,
  tabular = true,
  className = '',
}: {
  sen: number;
  signed?: boolean;
  colored?: boolean;
  trimZeroSen?: boolean;
  /** Equal-width digits for aligned columns; turn off for large standalone figures. */
  tabular?: boolean;
  className?: string;
}) {
  const tone = colored ? (sen > 0 ? 'text-sage-700' : sen < 0 ? 'text-rust-700' : '') : '';
  return <span className={`${tabular ? 'tabular ' : ''}whitespace-nowrap ${tone} ${className}`}>{formatRM(sen, { signed, trimZeroSen })}</span>;
}
