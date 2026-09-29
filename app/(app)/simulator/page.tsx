import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Thread } from "@/components/thread";
import { requireAppContext } from "@/lib/auth/context";
import { formatUSPhone, normalizeUSPhone } from "@/lib/phone";
import { loadThread } from "@/lib/services/thread";
import { createClient } from "@/lib/supabase/server";
import { SimulatorControls } from "./simulator-controls";

export const metadata: Metadata = { title: "Simulator" };

const DEFAULT_CALLER = "(843) 555-0142";

export default async function SimulatorPage({ searchParams }: PageProps<"/simulator">) {
  const { org } = await requireAppContext();
  const { from } = await searchParams;
  const callerInput = typeof from === "string" && from ? from : DEFAULT_CALLER;
  const caller = normalizeUSPhone(callerInput);

  const supabase = await createClient();
  const { data: phone } = await supabase
    .from("phone_numbers")
    .select("e164, provider")
    .eq("org_id", org.id)
    .limit(1)
    .maybeSingle();

  const { data: contact } = caller
    ? await supabase.from("contacts").select("id, opted_out_at").eq("org_id", org.id).eq("phone", caller).maybeSingle()
    : { data: null };
  const thread = contact ? await loadThread(supabase, org.id, contact.id) : [];
  const { data: alerts } = await supabase
    .from("notifications")
    .select("id, body, link, created_at")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <>
      <PageHeader
        title="Simulator"
        subtitle="Fake calls and texts to see exactly what your customers would get. Nothing real is sent."
      />

      {!phone || phone.provider !== "simulator" ? (
        <p className="card text-slate-700">
          {phone
            ? "Your business uses a real phone number, so the simulator is turned off. Call or text your number to test."
            : "Get a pretend business number first. "}
          {!phone && (
            <Link href="/settings/phone" className="link">
              Set up phone number
            </Link>
          )}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-slate-600">
            Business number: <strong>{formatUSPhone(phone.e164)}</strong>
          </p>
          <SimulatorControls from={callerInput} />

          <section>
            <h2 className="mb-2 text-lg font-semibold">
              Customer&apos;s phone {caller ? `(${formatUSPhone(caller)})` : ""}
            </h2>
            {contact?.opted_out_at && (
              <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">This customer has opted out.</p>
            )}
            <div className="rounded-3xl bg-slate-100 p-3">
              <Thread items={thread} timeZone={org.timezone} perspective="customer" />
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Owner alerts</h2>
            <p className="mb-2 text-sm text-slate-600">
              With a real number, these are texted to your cell{org.alert_phone ? ` (${formatUSPhone(org.alert_phone)})` : ""}.
            </p>
            <ul className="flex flex-col gap-2">
              {(alerts ?? []).map((a) => (
                <li key={a.id} className="card py-3 text-sm">
                  {a.link ? (
                    <Link href={a.link} className="font-medium text-brand-700">
                      {a.body}
                    </Link>
                  ) : (
                    a.body
                  )}
                </li>
              ))}
              {(alerts ?? []).length === 0 && <li className="text-sm text-slate-500">No alerts yet.</li>}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}
