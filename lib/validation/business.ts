import { z } from "zod";
import { BUSINESS_TYPES, LANGUAGES } from "@/lib/business-types";
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

export function parseBusinessForm(formData: FormData) {
  return businessSchema.safeParse({
    name: formData.get("name") ?? "",
    business_type: formData.get("business_type") ?? undefined,
    default_language: formData.get("default_language") ?? undefined,
    alert_phone: formData.get("alert_phone") ?? null,
    google_review_url: formData.get("google_review_url") ?? null,
  });
}
