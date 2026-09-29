import { isBusinessType, isLanguage, type BusinessType, type Language } from "@/lib/business-types";
import type { Tables } from "@/lib/database.types";

/** An organization row with its text columns narrowed to the values the database allows. */
export type Org = Omit<Tables<"organizations">, "business_type" | "default_language"> & {
  business_type: BusinessType;
  default_language: Language;
};

export function toOrg(row: Tables<"organizations">): Org {
  if (!isBusinessType(row.business_type)) throw new Error(`Unknown business type: ${row.business_type}`);
  return {
    ...row,
    business_type: row.business_type,
    default_language: isLanguage(row.default_language) ? row.default_language : "en",
  };
}

export type Role = "owner" | "manager";
export const toRole = (value: string): Role => (value === "owner" ? "owner" : "manager");
