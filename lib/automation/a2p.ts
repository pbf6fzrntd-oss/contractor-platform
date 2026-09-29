import { renderTemplate } from "@/lib/templates/render";

/**
 * Carrier (A2P 10DLC) registration helpers. Carriers review each business's
 * description, opt-in process and sample messages, so we pre-fill them from
 * what the app actually sends.
 */

export type BrandType = "standard" | "sole_proprietor";

export type RegistrationInput = {
  brand_type: BrandType;
  legal_name: string;
  ein: string;
  business_address: string;
  website: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  use_case_description: string;
  opt_in_description: string;
  sample_messages: string[];
};

export function defaultUseCase(businessName: string, businessType: string): string {
  const work = businessType === "recurring" ? "lawn care and landscaping" : "home repair and improvement";
  return (
    `${businessName} is a local ${work} business in the Charleston, SC area. We text customers and people who ` +
    `contact us: replies when we miss their call, follow-ups on estimates they requested, service updates ` +
    `(schedule changes and weather delays), Google review requests after a job` +
    (businessType === "recurring" ? `, and occasional seasonal offers to customers who opted in to promotions.` : ".")
  );
}

export function defaultOptIn(businessName: string, website: string | null): string {
  return (
    `Customers opt in by calling or texting ${businessName} first (we reply to their inquiry), or by agreeing to ` +
    `text updates when they book service. Promotional texts are only sent to customers who gave written consent ` +
    `on our service agreement or online form. Every first message and every promotion says "Reply STOP to opt out"; ` +
    `HELP returns our contact info. Terms: ${website ? `${website.replace(/\/$/, "")}/sms-terms` : "see our SMS terms page"}.`
  );
}

/** Sample messages built from the business's own templates. */
export function sampleMessages(templates: { key: string; body: string }[], businessName: string, reviewLink: string | null): string[] {
  const keys = ["missed_call_reply", "estimate_followup_1", "review_request", "rain_delay", "campaign_aeration"];
  return keys
    .map((k) => templates.find((t) => t.key === k)?.body)
    .filter((b): b is string => Boolean(b))
    .slice(0, 5)
    .map((body, i) =>
      `${renderTemplate(body, {
        business_name: businessName,
        first_name: "Mike",
        review_link: reviewLink ?? "https://g.page/r/example",
        service_day: "Tuesday",
        new_day: "Thursday",
      })}${i === 0 || body.includes("YES") ? " Reply STOP to opt out." : ""}`,
    );
}

/** What's missing or wrong before we can submit. */
export function validateRegistration(r: RegistrationInput): string[] {
  const errors: string[] = [];
  if (!r.legal_name.trim()) errors.push("Enter the legal business name (as on your IRS paperwork).");
  if (r.brand_type === "standard") {
    if (!/^\d{2}-?\d{7}$/.test(r.ein.trim())) errors.push("Enter your 9-digit EIN, like 12-3456789.");
    if (!/^https?:\/\/\S+\.\S+/.test(r.website.trim())) errors.push("Enter your website address (carriers check it).");
  }
  if (r.business_address.trim().length < 10) errors.push("Enter the full business address.");
  if (!r.contact_name.trim()) errors.push("Enter a contact name.");
  if (!/^\S+@\S+\.\S+$/.test(r.contact_email.trim())) errors.push("Enter a contact email.");
  if (r.contact_phone.replace(/\D/g, "").length < 10) errors.push("Enter a contact phone.");
  if (r.use_case_description.trim().length < 40) errors.push("Describe what you text customers about (a few sentences).");
  if (r.opt_in_description.trim().length < 40) errors.push("Describe how customers agree to get texts.");
  if (r.sample_messages.filter((m) => m.trim()).length < 2) errors.push("Include at least 2 sample messages.");
  return errors;
}

export const REGISTRATION_STATUS_TEXT: Record<string, string> = {
  not_started: "Not started",
  submitted: "Submitted: we're preparing your registration",
  in_review: "With the carriers for review (usually a few days to 2 weeks)",
  approved: "Approved: texting is on",
  rejected: "Needs changes",
};
