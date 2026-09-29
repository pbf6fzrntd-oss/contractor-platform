import { BUSINESS_TYPE_INFO, type BusinessType } from "@/lib/business-types";
import { HOME_SERVICES_INDUSTRIES } from "@/lib/industries/home-services";
import type { IndustryConfig, ModuleId } from "@/lib/industries/types";

export type { IndustryConfig } from "@/lib/industries/types";

/** Every industry we know about, available or not. */
export const INDUSTRIES: readonly IndustryConfig[] = [...HOME_SERVICES_INDUSTRIES];

export const MODULE_LABELS: Record<ModuleId, string> = {
  home_services: "Home services",
  recurring_home: "Recurring home services",
  project_quote: "Project & quote services",
  pet_care: "Pet care",
  automotive: "Automotive",
};

export function getIndustry(key: string | null | undefined): IndustryConfig | undefined {
  return key ? INDUSTRIES.find((i) => i.key === key) : undefined;
}

export function isIndustryKey(key: unknown): key is string {
  return typeof key === "string" && INDUSTRIES.some((i) => i.key === key);
}

/**
 * Picker choices: a specific industry, or "other" for each business type
 * (stored as industry = null, the generic behavior every business had before).
 */
export const OTHER_CHOICE: Record<BusinessType, string> = { project: "other_project", recurring: "other_recurring" };

export type IndustryChoice = { value: string; label: string; hint: string; businessType: BusinessType };
export type IndustryGroup = { label: string; choices: IndustryChoice[] };

/**
 * Industries a business can pick, grouped for a phone-friendly select.
 * Coming-soon industries are left out unless the business already has one
 * (e.g. set by the platform admin for a pilot).
 */
export function industryGroups(current?: string | null): IndustryGroup[] {
  const groups = new Map<string, IndustryChoice[]>();
  for (const i of INDUSTRIES) {
    if (i.status !== "available" && i.key !== current) continue;
    const label = i.module === "home_services" ? (i.businessType === "recurring" ? "Lawn & landscaping" : "Trades") : MODULE_LABELS[i.module];
    groups.set(label, [...(groups.get(label) ?? []), { value: i.key, label: i.label, hint: i.hint, businessType: i.businessType }]);
  }
  const other = (type: BusinessType): IndustryChoice => ({
    value: OTHER_CHOICE[type],
    label: type === "project" ? "Other trade" : "Other lawn or yard service",
    hint: BUSINESS_TYPE_INFO[type].description,
    businessType: type,
  });
  groups.set("Trades", [...(groups.get("Trades") ?? []), other("project")]);
  groups.set("Lawn & landscaping", [...(groups.get("Lawn & landscaping") ?? []), other("recurring")]);
  return [...groups.entries()].map(([label, choices]) => ({ label, choices }));
}

/** Turns a picker value into what's stored: the industry key (or null) and the business type. */
export function resolveIndustryChoice(value: unknown): { industry: string | null; business_type: BusinessType } | null {
  if (value === OTHER_CHOICE.project) return { industry: null, business_type: "project" };
  if (value === OTHER_CHOICE.recurring) return { industry: null, business_type: "recurring" };
  const industry = getIndustry(typeof value === "string" ? value : null);
  return industry ? { industry: industry.key, business_type: industry.businessType } : null;
}

/** The picker value for a business as it is today. */
export function industryChoiceFor(org: { industry: string | null; business_type: BusinessType }): string {
  return getIndustry(org.industry)?.key ?? OTHER_CHOICE[org.business_type];
}

/** "Roofing" or, for generic businesses, the business type's label. */
export function industryLabel(org: { industry: string | null; business_type: BusinessType }): string {
  return getIndustry(org.industry)?.label ?? BUSINESS_TYPE_INFO[org.business_type].label;
}
