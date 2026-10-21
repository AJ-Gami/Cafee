import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'accent' | 'secondary' | 'danger' | 'ghost';
type Size = 'md' | 'lg' | 'sm';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-espresso-800 text-cream-50 hover:bg-espresso-700 active:bg-espresso-900 disabled:bg-espresso-500/40 disabled:text-cream-50',
  accent: 'bg-sage-700 text-white hover:bg-sage-600 active:bg-sage-800 disabled:bg-sage-500/40',
  secondary:
    'border border-espresso-800/20 bg-cream-50 text-espresso-800 hover:bg-cream-200 active:bg-cream-300 disabled:text-espresso-500 disabled:bg-cream-100',
  danger: 'bg-rust-600 text-white hover:bg-rust-700 disabled:bg-rust-600/40',
  ghost: 'text-espresso-700 hover:bg-cream-200 active:bg-cream-300 disabled:text-espresso-500/60',
};

const SIZES: Record<Size, string> = {
  sm: 'min-h-10 px-3 text-sm',
  md: 'min-h-11 px-4 text-[15px]',
  lg: 'min-h-14 px-5 text-base',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  icon?: ReactNode;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  icon,
  loading = false,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? (
        <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      ) : (
        icon
      )}
      {children != null && children !== false ? <span className="min-w-0 [&>svg]:inline-block [&>svg]:align-[-0.15em]">{children}</span> : null}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-11 items-center justify-center rounded-xl text-espresso-700 transition-colors hover:bg-cream-200 active:bg-cream-300 disabled:opacity-40 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
