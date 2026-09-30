import { z } from "zod";

/** Licenses, certifications and insurance a business shows customers. */
export const CREDENTIAL_KINDS = ["license", "certification", "insurance", "registration", "bond"] as const;
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

export const CREDENTIAL_KIND_LABEL: Record<CredentialKind, string> = {
  license: "License",
  certification: "Certification",
  insurance: "Insurance",
  registration: "Registration / permit",
  bond: "Bond",
};

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

export const credentialSchema = z.object({
  kind: z.enum(CREDENTIAL_KINDS, { message: "Pick what kind it is." }),
  label: z.string().trim().min(1, "Name it, e.g. \"SC residential builder license\".").max(150),
  number: optional(80),
  issuer: optional(150),
  expires_on: z
    .string()
    .trim()
    .transform((v) => v || null)
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Pick a date."),
  show_on_profile: z.boolean(),
});

export function parseCredentialForm(form: FormData) {
  return credentialSchema.safeParse({
    kind: form.get("kind"),
    label: form.get("label") ?? "",
    number: form.get("number") ?? "",
    issuer: form.get("issuer") ?? "",
    expires_on: form.get("expires_on") ?? "",
    show_on_profile: form.get("show_on_profile") === "on",
  });
}

/** "expired", "expiring" (within 30 days) or "ok". */
export function credentialStatus(expiresOn: string | null, today: string): "expired" | "expiring" | "ok" {
  if (!expiresOn) return "ok";
  if (expiresOn < today) return "expired";
  const soon = new Date(`${today}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + 30);
  return expiresOn <= soon.toISOString().slice(0, 10) ? "expiring" : "ok";
}
