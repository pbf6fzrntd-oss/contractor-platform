"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requireAppContext } from "@/lib/auth/context";
import { FREQUENCIES, type Frequency } from "@/lib/automation/schedule";
import { isLanguage } from "@/lib/business-types";
import { parseDollars } from "@/lib/format";
import { parseCustomerCsv } from "@/lib/import/customers-csv";
import { normalizeUSPhone } from "@/lib/phone";
import { MARKETING_CONSENT_METHODS, type MarketingConsentMethod } from "@/lib/consent";
import { addRecurringCustomer } from "@/lib/services/customers";
import { createClient } from "@/lib/supabase/server";
import { localDateString } from "@/lib/time";

function marketingFrom(formData: FormData) {
  if (formData.get("marketing_consent") !== "on") return null;
  const method = String(formData.get("marketing_method") ?? "");
  if (!(method in MARKETING_CONSENT_METHODS)) return undefined;
  return {
    method: method as MarketingConsentMethod,
    evidence: String(formData.get("marketing_evidence") ?? "").trim().slice(0, 500) || null,
  };
}

export async function createCustomer(_prev: FormState, formData: FormData): Promise<FormState> {
  const { org } = await requireAppContext("/customers");
  const phone = normalizeUSPhone(String(formData.get("phone") ?? ""));
  if (!phone) return { error: "Enter a 10-digit US phone number." };
  const serviceType = String(formData.get("service_type") ?? "").trim().slice(0, 60);
  if (!serviceType) return { error: "Enter the service (e.g. Mowing)." };
  const frequency = String(formData.get("frequency"));
  if (!(FREQUENCIES as readonly string[]).includes(frequency)) return { error: "Pick how often." };
  const day = Number(formData.get("service_day"));
  if (!(day >= 0 && day <= 6)) return { error: "Pick the service day." };
  const price = parseDollars(formData.get("price")?.toString());
  if (price === undefined) return { error: "Enter the price as a dollar amount." };
  const startDate = String(formData.get("start_date") || localDateString(new Date(), org.timezone));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { error: "Pick a start date." };
  if (formData.get("service_texts") !== "on") {
    return { error: "Confirm the customer agreed to get texts about their service." };
  }
  const marketing = marketingFrom(formData);
  if (marketing === undefined) return { error: "Pick how they agreed to receive offers." };
  const language = String(formData.get("language") ?? org.default_language);

  const supabase = await createClient();
  let serviceId: string;
  try {
    ({ serviceId } = await addRecurringCustomer(
      supabase,
      org.id,
      {
        phone,
        name: String(formData.get("name") ?? "").trim().slice(0, 100) || null,
        address: String(formData.get("address") ?? "").trim().slice(0, 300) || null,
        email: String(formData.get("email") ?? "").trim().slice(0, 200) || null,
        language: isLanguage(language) ? language : "en",
        service_type: serviceType,
        frequency: frequency as Frequency,
        service_day: day,
        price_cents: price,
        start_date: startDate,
      },
      { serviceTextsMethod: "owner_recorded", marketing },
    ));
  } catch (e) {
    console.error("add customer failed", e);
    return { error: "Couldn't save the customer. Please try again." };
  }
  revalidatePath("/customers");
  redirect(`/customers/${serviceId}`);
}

export async function importCustomers(_prev: FormState, formData: FormData): Promise<FormState> {
  const { org } = await requireAppContext("/customers");
  if (formData.get("service_texts") !== "on") {
    return { error: "Confirm these customers agreed to get texts about their service." };
  }
  const marketing = marketingFrom(formData);
  if (marketing === undefined) return { error: "Pick how they agreed to receive offers." };

  const text = String(formData.get("csv") ?? "");
  if (text.length > 2_000_000) return { error: "That file is too big. Split it into smaller files." };
  const parsed = parseCustomerCsv(text, { language: org.default_language, serviceType: "Mowing" });
  if (parsed.missingColumns.length) return { error: `Missing column(s): ${parsed.missingColumns.join(", ")}.` };
  if (parsed.customers.length === 0) return { error: "No rows could be imported. Check the errors in the preview." };

  const supabase = await createClient();
  const today = localDateString(new Date(), org.timezone);
  let imported = 0;
  for (const c of parsed.customers) {
    try {
      await addRecurringCustomer(
        supabase,
        org.id,
        { ...c, start_date: c.start_date ?? today },
        { serviceTextsMethod: "import_attestation", marketing },
      );
      imported++;
    } catch (e) {
      console.error("import row failed", c.line, e);
    }
  }
  revalidatePath("/customers");
  const skipped = parsed.errors.length + (parsed.customers.length - imported);
  return { success: `Imported ${imported} customer${imported === 1 ? "" : "s"}.${skipped ? ` Skipped ${skipped} row(s).` : ""}` };
}
