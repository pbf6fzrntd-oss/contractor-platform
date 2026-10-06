"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "@/components/nav-icon";
import type { NavItem } from "@/lib/navigation";

/** Left-hand menu on laptops and tablets (the bottom bar is for phones). */
export function SideNav({
  appName,
  businessName,
  items,
  extras = [],
  badges = {},
}: {
  appName: string;
  businessName: string;
  items: NavItem[];
  /** Smaller links under the main menu (e.g. the texting simulator). */
  extras?: { href: string; label: string }[];
  badges?: Record<string, number>;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav aria-label="Main" className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col overflow-y-auto border-r border-slate-200 bg-white lg:flex">
      <div className="px-5 pb-4 pt-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{appName}</p>
        <p className="mt-1 truncate text-lg font-bold text-slate-900" title={businessName}>{businessName}</p>
      </div>
      <ul className="flex flex-1 flex-col gap-1 px-3">
        {items.map((item) => {
          const active = isActive(item.href);
          const badge = badges[item.href] ?? 0;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium ${
                  active ? "bg-brand-50 text-brand-800" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <NavIcon name={item.icon} className="h-5 w-5" />
                <span className="flex-1">{item.label}</span>
                {badge > 0 && (
                  <span className="min-w-6 rounded-full bg-red-600 px-1.5 text-center text-xs font-bold leading-6 text-white">{badge > 99 ? "99+" : badge}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      {extras.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-slate-100 px-3 py-3">
          {extras.map((e) => (
            <li key={e.href}>
              <Link
                href={e.href}
                aria-current={isActive(e.href) ? "page" : undefined}
                className={`flex min-h-12 items-center rounded-xl px-3 text-sm ${isActive(e.href) ? "bg-brand-50 font-medium text-brand-800" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {e.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
