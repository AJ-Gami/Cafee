/** Logo ResitKu: resit bergerigi atas petak kuning. */
export function LogoMark({ className = "size-12" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="16" fill="#FFD43B" />
      <path
        d="M20 14h24a2 2 0 0 1 2 2v34l-4-3-4 3-4-3-4 3-4-3-4 3-4-3V16a2 2 0 0 1 2-2Z"
        fill="#111827"
      />
      <rect x="24" y="22" width="16" height="3" rx="1.5" fill="#FFD43B" />
      <rect x="24" y="29" width="11" height="3" rx="1.5" fill="#FFD43B" />
      <rect x="24" y="36" width="14" height="3" rx="1.5" fill="#FFD43B" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className="size-10" />
      <span className="text-2xl font-extrabold tracking-tight">
        Resit<span className="text-accent-strong">Ku</span>
      </span>
    </span>
  );
}
