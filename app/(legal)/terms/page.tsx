import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME } from "@/lib/brand";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of service" };

// DRAFT: have an attorney review before launch.
export default function TermsPage() {
  return (
    <>
      <h1>Terms of service</h1>
      <p className="text-sm text-slate-500">Last updated {LEGAL.updated}</p>
      <p>
        These terms cover business accounts on {APP_NAME}, operated by {LEGAL.company}. By creating an account you agree
        to them.
      </p>
      <h2>Your responsibilities</h2>
      <ul>
        <li>You only text people who contacted your business or who gave you permission to text them.</li>
        <li>
          You only send promotional texts to people who gave prior express written consent, and you record how that
          consent was given.
        </li>
        <li>You honor opt-out requests. The app does this automatically for STOP replies.</li>
        <li>You keep your login secure and your business information accurate.</li>
      </ul>
      <h2>Service</h2>
      <p>
        Text delivery depends on phone carriers and may be delayed or blocked. Texting to customers requires carrier
        registration of your business.
      </p>
      <h2>Billing</h2>
      <p>Plans are billed monthly. Cancel anytime; access continues to the end of the paid period.</p>
      <p>
        See also our <Link href="/privacy" className="link">privacy policy</Link> and{" "}
        <Link href="/sms-terms" className="link">SMS terms</Link>. Questions: {LEGAL.email}
      </p>
    </>
  );
}
