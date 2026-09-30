import { RECURRING_HOME_INDUSTRIES } from "@/lib/industries/recurring-home";
import type { ModuleManifest } from "@/lib/modules/types";
import { MODULE_ID, runAgreementRenewals } from "./agreements";
import { recurringHomeAgentTools } from "./agent-tools";
import { AgreementsPanel, VisitReportsPanel } from "./customer-panel";
import { seedRecurringHomeDemo } from "./demo";

/**
 * Module A: Recurring Home Services (house cleaning, pest control, pool
 * service). Runs on the same routes, Today screen, rain delays and campaigns
 * as lawn care, and adds service agreements with renewal reminders.
 * Lawn companies can add it too (e.g. mosquito spraying plans).
 */
export const recurringHome: ModuleManifest = {
  id: MODULE_ID,
  name: "Recurring Home Services",
  description: "House cleaning, pest control and pool service: routes, access notes, service agreements and renewal reminders.",
  industries: RECURRING_HOME_INDUSTRIES.map((i) => i.key),
  navItems: [{ href: "/agreements", label: "Agreements", icon: "agreements", onlyFor: "recurring" }],
  dailyJobs: [{ name: "agreement_renewals", run: runAgreementRenewals }],
  customerPanels: [AgreementsPanel, VisitReportsPanel],
  ownerAgentTools: recurringHomeAgentTools,
  seedDemo: seedRecurringHomeDemo,
  routeStopLinks: ({ recurringServiceId, date, done }) => [{ href: `/visits/new?service=${recurringServiceId}&date=${date}`, label: done ? "Report ✓" : "Report" }],
};
