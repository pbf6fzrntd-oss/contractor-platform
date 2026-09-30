import type { Standing } from "./rules/agreements";

/** Badge words and colors for an agreement's standing. */
export const STANDING: Record<Standing, { label: string; className: string }> = {
  ongoing: { label: "Ongoing", className: "bg-brand-50 text-brand-800" },
  active: { label: "Active", className: "bg-brand-50 text-brand-800" },
  renewing_soon: { label: "Renewing soon", className: "bg-amber-100 text-amber-900" },
  overdue: { label: "Past end date", className: "bg-red-50 text-red-800" },
  ended: { label: "Ended", className: "bg-slate-100 text-slate-600" },
  canceled: { label: "Canceled", className: "bg-slate-100 text-slate-500" },
};
