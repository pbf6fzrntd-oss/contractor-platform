import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireAppContext } from "@/lib/auth/context";
import { serverEnv } from "@/lib/env";
import { formatUSPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { GetNumberForm, PhoneSetupForm } from "./forms";

export const metadata: Metadata = { title: "Phone number" };

export default async function PhoneSettingsPage() {
  const { org, role } = await requireAppContext();
  const supabase = await createClient();
  const { data: phone } = await supabase
    .from("phone_numbers")
    .select("*")
    .eq("org_id", org.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  const simulatorMode = serverEnv.smsProvider === "simulator";

  return (
    <>
      <PageHeader title="Phone number" backHref="/settings" />

      {!phone &&
        (role === "owner" ? (
          <GetNumberForm simulator={simulatorMode} />
        ) : (
          <p className="card text-slate-600">The owner hasn&apos;t set up a business number yet.</p>
        ))}

      {phone && (
        <div className="flex flex-col gap-5">
          <div className="card">
            <p className="text-sm text-slate-500">Your business number</p>
            <p className="text-2xl font-bold tracking-tight">{formatUSPhone(phone.e164)}</p>
            {phone.provider === "simulator" ? (
              <p className="mt-2 text-sm text-slate-600">
                Pretend number for testing.{" "}
                <Link href="/simulator" className="link">
                  Open the simulator
                </Link>{" "}
                to fake calls and texts.
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-600">
                Texting to customers turns on once your{" "}
                <Link href="/settings/registration" className="link">
                  carrier registration
                </Link>{" "}
                is approved.
              </p>
            )}
          </div>
          {role === "owner" && (
            <PhoneSetupForm phoneId={phone.id} number={phone.e164} mode={phone.setup_mode} forwardTo={phone.forward_to} />
          )}
        </div>
      )}
    </>
  );
}
