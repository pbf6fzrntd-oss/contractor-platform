import type { BusinessType, Language } from "@/lib/business-types";
import { DEFAULT_TEMPLATES, type DefaultTemplate } from "@/lib/templates/defaults";
import { findUnknownVariables } from "@/lib/templates/render";

/** The built-in template for a key, preferring this business type's version. */
export function findDefaultTemplate(key: string, businessType: BusinessType): DefaultTemplate | undefined {
  return (
    DEFAULT_TEMPLATES.find((t) => t.key === key && t.businessTypes.includes(businessType)) ??
    DEFAULT_TEMPLATES.find((t) => t.key === key)
  );
}

/** Checks new wording for a template. Returns a plain-English problem, or null if it's fine. */
export function validateTemplateBody(body: string, language: Language, def: DefaultTemplate): string | null {
  const name = language === "en" ? "English" : "Spanish";
  if (!body.trim()) return `The ${name} text can't be empty.`;
  if (body.length > 1000) return `The ${name} text is too long.`;
  const unknown = findUnknownVariables(body);
  if (unknown.length) return `The ${name} text has an unknown placeholder: {${unknown[0]}}. Check the spelling.`;
  if (def.text.en.includes("{business_name}") && !body.includes("{business_name}")) {
    return `Keep {business_name} in the ${name} text so customers know who's texting.`;
  }
  return null;
}
