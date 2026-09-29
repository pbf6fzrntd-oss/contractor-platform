import { HOME_SERVICES_INDUSTRIES } from "@/lib/industries/home-services";
import type { ModuleManifest } from "@/lib/modules/types";

/**
 * Home Services: the flagship edition (trades + lawn care). Its features are
 * today's core app (inbox, follow-ups, reviews, recurring customers, rain
 * delays, campaigns), so it adds no extra menus or tools of its own.
 */
export const homeServices: ModuleManifest = {
  id: "home_services",
  name: "Home Services",
  description: "Missed-call text-back, lead inbox, estimate follow-ups, review requests, recurring customers, rain delays and campaigns.",
  industries: HOME_SERVICES_INDUSTRIES.map((i) => i.key),
};
