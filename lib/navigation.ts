import type { BusinessType } from "@/lib/business-types";
import { hasFeature, type Plan, type PlanFeature } from "@/lib/entitlements";

export type NavIcon = "today" | "inbox" | "customers" | "campaigns" | "dashboard" | "settings" | "more" | "schedule" | "agreements";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
};

export type NavEntry = NavItem & {
  /** Only shown to this business type. Omit to show to everyone. */
  onlyFor?: BusinessType;
  /** Only shown if the plan includes this feature. */
  requires?: PlanFeature;
};

// Order matters: the first MAX_PRIMARY visible items go in the bottom bar.
const ENTRIES: NavEntry[] = [
  { href: "/today", label: "Today", icon: "today", onlyFor: "recurring", requires: "bulk_messaging" },
  { href: "/inbox", label: "Inbox", icon: "inbox" },
  { href: "/customers", label: "Customers", icon: "customers", onlyFor: "recurring", requires: "recurring_customers" },
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/campaigns", label: "Campaigns", icon: "campaigns", onlyFor: "recurring", requires: "campaigns" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

/** Bottom bar holds at most 5 buttons, so 4 items + "More" when needed. */
const MAX_BUTTONS = 5;

export type Navigation = {
  primary: NavItem[];
  /** Items reachable from the "More" page (empty if everything fits). */
  more: NavItem[];
};

/**
 * Menu items for a business. `extra` are items from its enabled modules
 * (lib/modules/types.ts), placed before Settings.
 */
export function visibleNavItems(businessType: BusinessType, plan: Plan, extra: NavEntry[] = []): NavItem[] {
  const entries = extra.length ? [...ENTRIES.slice(0, -1), ...extra, ENTRIES[ENTRIES.length - 1]] : ENTRIES;
  return entries.filter(
    (e) => (!e.onlyFor || e.onlyFor === businessType) && (!e.requires || hasFeature(plan, e.requires)),
  ).map(({ href, label, icon }) => ({ href, label, icon }));
}

export function buildNavigation(businessType: BusinessType, plan: Plan, extra: NavEntry[] = []): Navigation {
  const items = visibleNavItems(businessType, plan, extra);
  if (items.length <= MAX_BUTTONS) return { primary: items, more: [] };
  const primary = items.slice(0, MAX_BUTTONS - 1);
  const more = items.slice(MAX_BUTTONS - 1);
  return { primary: [...primary, { href: "/more", label: "More", icon: "more" }], more };
}

/** Is this path allowed for this business? Used to guard lawn-only pages. */
export function canVisit(path: string, businessType: BusinessType, plan: Plan, extra: NavEntry[] = []): boolean {
  const entry = [...ENTRIES, ...extra].find((e) => path === e.href || path.startsWith(`${e.href}/`));
  if (!entry) return true;
  return visibleNavItems(businessType, plan, extra).some((i) => i.href === entry.href);
}

/** Where to land after login: lawn businesses start on Today, trades on Inbox. */
export function homePath(businessType: BusinessType, plan: Plan): string {
  return visibleNavItems(businessType, plan)[0]?.href ?? "/inbox";
}
