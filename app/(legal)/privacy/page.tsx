import type { Metadata } from "next";
import { APP_NAME } from "@/lib/brand";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy policy" };

// DRAFT: have an attorney review before launch. Carrier registration (A2P 10DLC)
// requires the "no sharing of mobile information" language below.
export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy policy</h1>
      <p className="text-sm text-slate-500">Last updated {LEGAL.updated}</p>
      <p>
        {APP_NAME} is operated by {LEGAL.company}. We provide texting and follow-up tools to local home-service
        businesses (&quot;our customers&quot;). This policy explains what we collect and how we use it.
      </p>
      <h2>Information we collect</h2>
      <ul>
        <li>Account information for business users: name, email, business details.</li>
        <li>
          Contact information our customers&apos; clients share when they call or text a business: phone number, name,
          and message content.
        </li>
        <li>Records of consent and opt-out requests.</li>
      </ul>
      <h2>How we use it</h2>
      <p>
        Only to deliver the messaging service on behalf of the business you contacted: replying to your call or text,
        sending updates about estimates, jobs and scheduled service, and (only if you agreed) promotional offers from that
        business.
      </p>
      <h2>Mobile information</h2>
      <p>
        <strong>
          No mobile information will be shared with third parties or affiliates for marketing or promotional purposes.
          Text messaging originator opt-in data and consent will not be shared with any third parties.
        </strong>{" "}
        Information may be shared with service providers that help us deliver messages (such as our telecom provider),
        solely to provide the service.
      </p>
      <h2>Opting out</h2>
      <p>Reply STOP to any message to stop receiving texts from that business. Reply HELP for help.</p>
      <h2>Contact</h2>
      <p>
        {LEGAL.company}, {LEGAL.address}. Email: {LEGAL.email}
      </p>
    </>
  );
}
