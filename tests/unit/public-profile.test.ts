import { describe, expect, it } from "vitest";
import { isVerifiedSchemaType } from "@/lib/industries/schema-org";
import { bookingConsentText } from "@/lib/public/consent";
import { parsePublicProfile, priceText, slugify, toJsonLd, toLlmsText, type PublicProfile } from "@/lib/public/profile";

const PROFILE: PublicProfile = {
  name: "Rick's Roofing",
  slug: "ricks-roofing",
  industry: "roofing",
  business_type: "project",
  timezone: "America/New_York",
  about: "Family-owned since 2009.",
  service_area: "Summerville and Goose Creek",
  review_url: "https://g.page/r/rick",
  phone: "+18435550100",
  booking_available: true,
  hours: { open_days: [1, 2, 3, 4, 5], open_hour: 8, close_hour: 17 },
  service_zips: ["29483"],
  services: [
    { id: "11111111-1111-4111-8111-111111111111", name: "Roof inspection", name_es: null, booking_mode: "arrival_window", duration_minutes: 60, price_from_cents: 0, price_to_cents: 25000, price_unit: "visit", requires: [] },
    { id: "22222222-2222-4222-8222-222222222222", name: "Roof repair", name_es: null, booking_mode: "arrival_window", duration_minutes: 60, price_from_cents: 35000, price_to_cents: null, price_unit: "job", requires: [] },
  ],
  credentials: [{ kind: "license", label: "SC residential roofing registration", number: "RBB-1", issuer: "SC LLR", expires_on: "2027-06-30" }],
};

describe("public profile", () => {
  it("only accepts the exact allow-listed shape (anything extra is refused)", () => {
    expect(parsePublicProfile(PROFILE as never)).toEqual(PROFILE);
    expect(parsePublicProfile({ ...PROFILE, access_notes: "Gate 4821" } as never)).toBeNull();
    expect(parsePublicProfile({ ...PROFILE, services: [{ ...PROFILE.services[0], internal_notes: "x" }] } as never)).toBeNull();
    expect(parsePublicProfile(null)).toBeNull();
  });

  it("builds schema.org data with the industry's verified type, offers, hours, licenses and booking", () => {
    const ld = toJsonLd(PROFILE, "https://app.test/b/ricks-roofing", "https://app.test/b/ricks-roofing/book");
    expect(ld["@type"]).toBe("RoofingContractor");
    expect(isVerifiedSchemaType(ld["@type"] as string)).toBe(true);
    expect(ld.telephone).toBe("+18435550100");
    expect(ld.openingHoursSpecification).toMatchObject({ dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "08:00", closes: "17:00" });
    expect(ld.makesOffer).toEqual([
      expect.objectContaining({ itemOffered: { "@type": "Service", name: "Roof inspection" }, priceSpecification: expect.objectContaining({ minPrice: "0.00", maxPrice: "250.00" }) }),
      expect.objectContaining({ priceSpecification: expect.objectContaining({ minPrice: "350.00" }) }),
    ]);
    expect(ld.hasCredential).toEqual([expect.objectContaining({ name: "SC residential roofing registration", identifier: "RBB-1", validUntil: "2027-06-30" })]);
    expect(ld.potentialAction).toMatchObject({ "@type": "ReserveAction" });
    expect(ld.areaServed).toEqual(["Summerville and Goose Creek", { "@type": "PostalCodeSpecification", postalCode: "29483", addressCountry: "US" }]);
  });

  it("uses VeterinaryCare plus LocalBusiness for mobile vets, and LocalBusiness when there's no industry", () => {
    expect(toJsonLd({ ...PROFILE, industry: "mobile_vet" }, "u", null)["@type"]).toEqual(["VeterinaryCare", "LocalBusiness"]);
    expect(toJsonLd({ ...PROFILE, industry: null }, "u", null)["@type"]).toBe("LocalBusiness");
    expect(toJsonLd({ ...PROFILE, booking_available: false }, "u", null).potentialAction).toBeUndefined();
  });

  it("writes a plain summary for AI crawlers", () => {
    const txt = toLlmsText(PROFILE, "https://app.test/b/ricks-roofing", "https://app.test/b/ricks-roofing/book", "https://app.test/api/agent/ricks-roofing");
    expect(txt).toContain("# Rick's Roofing");
    expect(txt).toContain("Roof repair: From $350");
    expect(txt).toContain("via MCP: https://app.test/api/agent/ricks-roofing");
    expect(txt).toContain("(843) 555-0100");
  });

  it("prices and web addresses read naturally", () => {
    expect(priceText(PROFILE.services[0])).toBe("Up to $250/visit");
    expect(priceText({ price_from_cents: 10000, price_to_cents: 20000, price_unit: "job" })).toBe("$100–$200");
    expect(priceText({ price_from_cents: 0, price_to_cents: null, price_unit: "visit" })).toBe("Free");
    expect(priceText({ price_from_cents: null, price_to_cents: null, price_unit: null })).toBeNull();
    expect(slugify("Rick's Roofing & Gutters, LLC")).toBe("ricks-roofing-and-gutters-llc");
    expect(slugify("  Émile's  ")).toBe("emiles");
  });

  it("asks for clear texting consent in English and Spanish", () => {
    expect(bookingConsentText("Rick's Roofing")).toMatch(/Rick's Roofing.*Reply STOP to opt out/);
    expect(bookingConsentText("Rick's Roofing", "es")).toMatch(/Responda STOP/);
  });
});
