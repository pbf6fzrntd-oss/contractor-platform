import { BottomNav } from "@/components/bottom-nav";
import { requireAppContext } from "@/lib/auth/context";
import { buildNavigation } from "@/lib/navigation";

/** Shell for every logged-in page: content on top, navigation bar at the bottom. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { org, plan } = await requireAppContext();
  const nav = buildNavigation(org.business_type, plan);

  return (
    <>
      <div className="mx-auto max-w-lg px-4 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))]">{children}</div>
      <BottomNav items={nav.primary} moreHrefs={nav.more.map((i) => i.href)} />
    </>
  );
}
