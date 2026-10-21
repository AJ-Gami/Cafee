export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex min-h-11 min-w-14 items-center justify-center disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${checked ? 'bg-sage-600' : 'bg-espresso-500/40'}`}
        aria-hidden="true"
      >
        <span
          className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </span>
    </button>
  );
}
