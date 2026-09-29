import { z } from "zod";
import { BUSINESS_TYPES, LANGUAGES } from "@/lib/business-types";
import { resolveIndustryChoice } from "@/lib/industries";
import { normalizeUSPhone } from "@/lib/phone";

/** Treat blank form fields as "not provided". */
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional()
  .transform((v) => v ?? null);

/** Business details, shared by onboarding and Settings > Business. */
export const businessSchema = z.object({
  name: z.string().trim().min(1, "Enter your business name.").max(100, "Keep the name under 100 characters."),
  business_type: z.enum(BUSINESS_TYPES, { message: "Pick the type of business." }),
  /** Specific industry key, or null for the generic "Other" choices. Absent on older forms (left unchanged). */
  industry: z.string().nullable().optional(),
  default_language: z.enum(LANGUAGES).default("en"),
  alert_phone: optionalText.transform((v, ctx) => {
    if (v === null) return null;
    const phone = normalizeUSPhone(v);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "Enter a 10-digit US cell number, like (843) 555-1234." });
      return z.NEVER;
    }
    return phone;
  }),
  google_review_url: optionalText.refine((v) => v === null || /^https:\/\/\S+$/.test(v), {
    message: "Paste the full review link, starting with https://",
  }),
});

export type BusinessInput = z.infer<typeof businessSchema>;

/**
 * Reads the business form. The industry picker decides both the industry and
 * the business type; older forms that only send business_type still work.
 */
export function parseBusinessForm(formData: FormData) {
  const choice = formData.has("industry") ? resolveIndustryChoice(formData.get("industry")) : null;
  return businessSchema.safeParse({
    name: formData.get("name") ?? "",
    business_type: choice?.business_type ?? (formData.has("industry") ? undefined : (formData.get("business_type") ?? undefined)),
    industry: formData.has("industry") ? (choice?.industry ?? null) : undefined,
    default_language: formData.get("default_language") ?? undefined,
    alert_phone: formData.get("alert_phone") ?? null,
    google_review_url: formData.get("google_review_url") ?? null,
  });
}
