"use client";

import { Car, HandCoins, House, Receipt, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home", icon: House },
  { href: "/belanja", label: "Belanja", icon: Receipt },
  { href: "/hutang", label: "Hutang", icon: HandCoins },
  { href: "/kenderaan", label: "Kenderaan", icon: Car },
  { href: "/profil", label: "Profil", icon: UserRound },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-t border-line bg-white/95 backdrop-blur">
      <ul className="grid h-16 grid-cols-5">
        {TABS.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" || pathname.startsWith("/pautan") : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
                  active ? "text-ink" : "text-muted"
                }`}
              >
                <span className={`grid h-7 w-12 place-items-center rounded-full ${active ? "bg-accent" : ""}`}>
                  <tab.icon className="size-5" strokeWidth={active ? 2.4 : 2} />
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
