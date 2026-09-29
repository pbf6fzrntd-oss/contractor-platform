import { BottomNav } from "@/components/bottom-nav";
import { requireAppContext } from "@/lib/auth/context";
import { moduleNavEntries } from "@/lib/modules/types";
import { buildNavigation } from "@/lib/navigation";
import { MODULES } from "@/modules/registry";
import { createClient } from "@/lib/supabase/server";

/** Shell for every logged-in page: content on top, navigation bar at the bottom. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { org, plan, modules } = await requireAppContext();
  const nav = buildNavigation(org.business_type, plan, moduleNavEntries(MODULES, modules));
  const supabase = await createClient();
  const { count: unread } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org.id)
    .eq("unread", true);

  return (
    <>
      <div className="mx-auto max-w-lg px-4 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))]">{children}</div>
      <BottomNav items={nav.primary} moreHrefs={nav.more.map((i) => i.href)} badges={{ "/inbox": unread ?? 0 }} />
    </>
  );
}
