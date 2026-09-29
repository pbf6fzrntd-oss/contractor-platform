import type { Metadata } from "next";
import { APP_NAME } from "@/lib/brand";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "SMS terms" };

// Carrier registration reviewers check this page. Keep it accurate to what the app sends.
export default function SmsTermsPage() {
  return (
    <>
      <h1>SMS terms</h1>
      <p className="text-sm text-slate-500">Last updated {LEGAL.updated}</p>
      <p>
        Local home-service businesses use {APP_NAME} to text customers who contact them. You may receive texts from a
        business when you:
      </p>
      <ul>
        <li>call or text the business (for example, a reply after a missed call);</li>
        <li>request an estimate or book service (estimate follow-ups, schedule and weather updates, review requests);</li>
        <li>agree to receive offers (seasonal promotions, only with your consent).</li>
      </ul>
      <p>
        <strong>Message frequency varies. Message and data rates may apply.</strong> Reply <strong>STOP</strong> to opt
        out at any time; you&apos;ll get one confirmation text. Reply <strong>HELP</strong> for help, or contact{" "}
        {LEGAL.email}. Consent to promotional texts is not a condition of any purchase. Carriers are not liable for
        delayed or undelivered messages.
      </p>
      <p>
        Responda <strong>STOP</strong> para dejar de recibir mensajes y <strong>AYUDA</strong> para ayuda. Pueden aplicar
        tarifas de mensajes y datos.
      </p>
    </>
  );
}
