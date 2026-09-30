import { BottomNav } from "@/components/bottom-nav";
import { DemoBar } from "@/components/demo-bar";
import { SideNav } from "@/components/side-nav";
import { Suspense } from "react";
import { tryInboundText, tryMissedCall, trySkipAhead } from "./demo-actions";
import { APP_NAME } from "@/lib/brand";
import { requireAppContext } from "@/lib/auth/context";
import { bookingOn } from "@/lib/entitlements";
import { moduleNavEntries } from "@/lib/modules/types";
import { buildNavigation, visibleNavItems } from "@/lib/navigation";
import { MODULES } from "@/modules/registry";
import { createClient } from "@/lib/supabase/server";

/**
 * Shell for every logged-in page. Phones: content on top, navigation bar at the
 * bottom. Laptops/tablets: a menu on the left. Pages that need room (inbox,
 * dashboard, today…) mark their top element with `data-wide` to use the full width.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { org, plan, modules } = await requireAppContext();
  // "Schedule" appears only for businesses that turned on booking (off for everyone by default).
  const extra = [...(bookingOn(org, plan, modules) ? [{ href: "/schedule", label: "Schedule", icon: "schedule" as const }] : []), ...moduleNavEntries(MODULES, modules)];
  const nav = buildNavigation(org.business_type, plan, extra);
  const supabase = await createClient();
  const { count: unread } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org.id)
    .eq("unread", true);

  const badges = { "/inbox": unread ?? 0 };

  return (
    <>
      <SideNav
        appName={APP_NAME}
        businessName={org.name}
        items={visibleNavItems(org.business_type, plan, extra)}
        extras={[{ href: "/simulator", label: "📱 Texting simulator" }]}
        badges={badges}
      />
      <div className="lg:pl-60">
        <div className="mx-auto max-w-lg px-4 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))] lg:max-w-3xl lg:px-8 lg:pb-12 lg:pt-8 lg:has-[[data-wide]]:max-w-7xl">
          {org.is_demo && (
            <Suspense>
              <DemoBar
                businessName={org.name}
                hoursLeft={Math.max(1, Math.round((Date.parse(org.demo_expires_at ?? "") - new Date().getTime()) / 3_600_000) || 24)}
                recurring={org.business_type === "recurring"}
                bookingPath={org.booking_enabled && org.slug ? `/b/${org.slug}/book` : null}
                actions={{ missedCall: tryMissedCall, text: tryInboundText.bind(null, false), textEs: tryInboundText.bind(null, true), skipAhead: trySkipAhead }}
              />
            </Suspense>
          )}
          {children}
        </div>
      </div>
      <BottomNav items={nav.primary} moreHrefs={nav.more.map((i) => i.href)} badges={badges} />
    </>
  );
}
