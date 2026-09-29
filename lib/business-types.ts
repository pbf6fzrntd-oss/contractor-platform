/**
 * The two kinds of business we serve. Chosen at onboarding; it controls
 * navigation, lead-stage labels and default templates. One codebase, one
 * data model: never fork features by type, just show or hide them.
 */
export const BUSINESS_TYPES = ["project", "recurring"] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const BUSINESS_TYPE_INFO: Record<BusinessType, { label: string; description: string }> = {
  project: {
    label: "Project-based trade",
    description: "Roofing, HVAC, electrical, remodeling: one-off jobs quoted with estimates.",
  },
  recurring: {
    label: "Lawn care & landscaping",
    description: "Weekly or biweekly service customers, plus seasonal extras.",
  },
};

export function isBusinessType(value: unknown): value is BusinessType {
  return typeof value === "string" && (BUSINESS_TYPES as readonly string[]).includes(value);
}

export const LANGUAGES = ["en", "es"] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<Language, string> = { en: "English", es: "Spanish" };

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}
