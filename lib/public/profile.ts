import { z } from "zod";
import type { Json } from "@/lib/database.types";
import { getIndustry } from "@/lib/industries";
import { formatUSPhone } from "@/lib/phone";

/**
 * The public business profile (hosted page, JSON-LD, llms.txt, outside AI
 * agents). Built ONLY from public_business_profile() (a database allow-list),
 * parsed strictly here so nothing unexpected can pass through.
 */

const service = z.object({
  id: z.string().uuid(),
  name: z.string(),
  name_es: z.string().nullable(),
  booking_mode: z.string(),
  duration_minutes: z.number(),
  price_from_cents: z.number().nullable(),
  price_to_cents: z.number().nullable(),
  price_unit: z.string().nullable(),
  requires: z.array(z.string()),
}).strict();

const credential = z.object({
  kind: z.string(),
  label: z.string(),
  number: z.string().nullable(),
  issuer: z.string().nullable(),
  expires_on: z.string().nullable(),
}).strict();

export const publicProfileSchema = z
  .object({
    name: z.string(),
    slug: z.string(),
    industry: z.string().nullable(),
    business_type: z.string(),
    timezone: z.string(),
    about: z.string().nullable(),
    service_area: z.string().nullable(),
    review_url: z.string().nullable(),
    phone: z.string().nullable(),
    booking_available: z.boolean(),
    hours: z.object({ open_days: z.array(z.number()), open_hour: z.number(), close_hour: z.number() }).strict().nullable(),
    service_zips: z.array(z.string()),
    services: z.array(service),
    credentials: z.array(credential),
  })
  .strict();

export type PublicProfile = z.infer<typeof publicProfileSchema>;

export function parsePublicProfile(value: Json | null | undefined): PublicProfile | null {
  if (!value) return null;
  const parsed = publicProfileSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Owner's profile settings (organizations.profile). */
export const profileSettingsSchema = z.object({
  about: z.string().trim().max(1000).optional(),
  service_area: z.string().trim().max(300).optional(),
  show_prices: z.boolean().optional(),
});

export const SLUG_RULE = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/;

/** "Rick's Roofing & Gutters" -> "ricks-roofing-gutters". */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
}

const DAY_CODES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hh = (h: number) => `${String(h === 24 ? 23 : h).padStart(2, "0")}:${h === 24 ? "59" : "00"}`;
const dollars = (cents: number) => (cents / 100).toFixed(2);

export function priceText(s: Pick<PublicProfile["services"][number], "price_from_cents" | "price_to_cents" | "price_unit">): string | null {
  if (s.price_from_cents == null) return null;
  const f = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;
  const unit = s.price_unit && s.price_unit !== "job" ? `/${s.price_unit}` : "";
  if (s.price_from_cents === 0 && !s.price_to_cents) return "Free";
  if (s.price_from_cents === 0 && s.price_to_cents) return `Up to ${f(s.price_to_cents)}${unit}`;
  return s.price_to_cents ? `${f(s.price_from_cents)}–${f(s.price_to_cents)}${unit}` : `From ${f(s.price_from_cents)}${unit}`;
}

/**
 * schema.org structured data for the hosted profile, so search engines and
 * AI assistants can read the business reliably. Uses the industry's verified type.
 */
export function toJsonLd(p: PublicProfile, pageUrl: string, bookingUrl: string | null): Record<string, unknown> {
  const industry = getIndustry(p.industry);
  const type = industry ? [industry.schemaOrg.type, ...(industry.schemaOrg.additionalTypes ?? [])] : ["LocalBusiness"];
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": type.length === 1 ? type[0] : type,
    "@id": `${pageUrl}#business`,
    name: p.name,
    url: pageUrl,
  };
  if (p.about) data.description = p.about;
  if (p.phone) data.telephone = p.phone;
  if (p.service_area || p.service_zips.length) {
    data.areaServed = [
      ...(p.service_area ? [p.service_area] : []),
      ...p.service_zips.map((zip) => ({ "@type": "PostalCodeSpecification", postalCode: zip, addressCountry: "US" })),
    ];
  }
  if (p.hours) {
    data.openingHoursSpecification = {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: p.hours.open_days.map((d) => DAY_CODES[d]),
      opens: hh(p.hours.open_hour),
      closes: hh(p.hours.close_hour),
    };
  }
  if (p.services.length) {
    data.makesOffer = p.services.map((s) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Service", name: s.name },
      ...(s.price_from_cents != null
        ? {
            priceSpecification: {
              "@type": "PriceSpecification",
              priceCurrency: "USD",
              minPrice: dollars(s.price_from_cents),
              ...(s.price_to_cents ? { maxPrice: dollars(s.price_to_cents) } : {}),
            },
          }
        : {}),
    }));
  }
  if (p.credentials.length) {
    data.hasCredential = p.credentials.map((c) => ({
      "@type": "EducationalOccupationalCredential",
      credentialCategory: c.kind,
      name: c.label,
      ...(c.number ? { identifier: c.number } : {}),
      ...(c.issuer ? { recognizedBy: { "@type": "Organization", name: c.issuer } } : {}),
      ...(c.expires_on ? { validUntil: c.expires_on } : {}),
    }));
  }
  if (p.review_url) data.sameAs = [p.review_url];
  if (bookingUrl) {
    data.potentialAction = { "@type": "ReserveAction", target: { "@type": "EntryPoint", urlTemplate: bookingUrl, actionPlatform: ["https://schema.org/DesktopWebPlatform", "https://schema.org/MobileWebPlatform"] } };
  }
  return data;
}

/** Plain-text summary for AI crawlers (llms.txt), including how agents can book. */
export function toLlmsText(p: PublicProfile, pageUrl: string, bookingUrl: string | null, agentUrl: string | null): string {
  const industry = getIndustry(p.industry);
  const lines = [
    `# ${p.name}`,
    "",
    `> ${industry?.label ?? "Local service business"}${p.service_area ? ` serving ${p.service_area}` : ""}.`,
    "",
  ];
  if (p.about) lines.push(p.about, "");
  if (p.phone) lines.push(`- Phone / text: ${formatUSPhone(p.phone)}`);
  lines.push(`- Profile: ${pageUrl}`);
  if (bookingUrl) lines.push(`- Book online: ${bookingUrl}`);
  if (agentUrl) lines.push(`- AI agents can check availability and request bookings via MCP: ${agentUrl}`);
  if (p.hours) lines.push(`- Hours: ${p.hours.open_days.map((d) => DAY_CODES[d].slice(0, 3)).join(", ")} ${p.hours.open_hour}:00–${p.hours.close_hour}:00`);
  if (p.services.length) {
    lines.push("", "## Services");
    for (const s of p.services) lines.push(`- ${s.name}${priceText(s) ? `: ${priceText(s)} (estimate; the business confirms)` : ""}`);
  }
  if (p.credentials.length) {
    lines.push("", "## Licenses and insurance");
    for (const c of p.credentials) lines.push(`- ${c.label}${c.number ? ` #${c.number}` : ""}${c.issuer ? ` (${c.issuer})` : ""}`);
  }
  return lines.join("\n") + "\n";
}
