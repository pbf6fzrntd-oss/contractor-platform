"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "@/components/nav-icon";
import type { NavItem } from "@/lib/navigation";

/** Thumb-reachable navigation bar fixed to the bottom of the phone screen. */
export function BottomNav({
  items,
  moreHrefs,
  badges = {},
}: {
  items: NavItem[];
  moreHrefs: string[];
  badges?: Record<string, number>;
}) {
  const pathname = usePathname();

  function isActive(href: string) {
    const matches = (h: string) => pathname === h || pathname.startsWith(`${h}/`);
    if (href === "/more") return matches("/more") || moreHrefs.some(matches);
    return matches(href);
  }

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t lg:hidden border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-lg">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                  active ? "text-brand-700" : "text-slate-500"
                }`}
              >
                <span className="relative">
                  <NavIcon name={item.icon} />
                  {(badges[item.href] ?? 0) > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-5 text-white">
                      {badges[item.href] > 99 ? "99+" : badges[item.href]}
                    </span>
                  )}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
