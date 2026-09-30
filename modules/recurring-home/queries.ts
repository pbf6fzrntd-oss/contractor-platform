import "server-only";
import { formatUSPhone } from "@/lib/phone";
import type { createClient } from "@/lib/supabase/server";

type UserClient = Awaited<ReturnType<typeof createClient>>;

/** Customers to pick from: each recurring service (so an agreement can point at the route it covers). */
export async function agreementCustomers(supabase: UserClient, orgId: string) {
  const [{ data: services }, { data: contacts }] = await Promise.all([
    supabase.from("recurring_services").select("id, contact_id, service_type, status").eq("org_id", orgId).neq("status", "canceled").limit(2000),
    supabase.from("contacts").select("id, name, phone").eq("org_id", orgId).limit(5000),
  ]);
  const name = (id: string) => {
    const c = contacts?.find((x) => x.id === id);
    return c?.name ?? (c ? formatUSPhone(c.phone) : "Customer");
  };
  return (services ?? [])
    .map((s) => ({ contactId: s.contact_id, serviceId: s.id as string | null, label: `${name(s.contact_id)} · ${s.service_type}` }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function contactName(c: { name: string | null; phone: string } | undefined | null): string {
  return c?.name ?? (c ? formatUSPhone(c.phone) : "Customer");
}
