"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Videos" },
  { href: "/dashboard/about", label: "About page" },
];

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Dashboard sections"
      className="flex items-center gap-6 border-b border-neutral-200"
    >
      {TABS.map((t) => {
        const active =
          t.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`relative -mb-px py-3 text-[11px] uppercase tracking-wider transition ${
              active
                ? "text-[#040d08]"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {t.label}
            {active && (
              <span className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-[#040d08]" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
