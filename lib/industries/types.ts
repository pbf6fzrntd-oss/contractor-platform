import type { BusinessType, Language } from "@/lib/business-types";
import type { LeadStage } from "@/lib/leads/stages";

/**
 * An industry is a specific trade (roofing, pest control, dog grooming...).
 * Industry configs are plain DATA, kept in the core so onboarding and the
 * sales audit can use every industry, even before its module is built.
 * Modules (in /modules) add behavior on top: screens, tables, AI tools.
 */

export const MODULE_IDS = ["home_services", "recurring_home", "project_quote", "pet_care", "automotive"] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export const SUBJECT_TYPES = ["property", "pet", "vehicle"] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

export const BOOKING_MODES = [
  "arrival_window",
  "fixed_appointment",
  "day_capacity",
  "multi_day_reservation",
  "recurring",
  "mobile_appointment",
  "package_sessions",
] as const;
export type BookingMode = (typeof BOOKING_MODES)[number];

export type Bilingual = Record<Language, string>;

export type PriceUnit = "job" | "visit" | "hour" | "night" | "session" | "month" | "package";

export type ServiceItem = {
  key: string;
  name: Bilingual;
  /** Typical price range in cents, shown as "from $X" / "$X–$Y". Estimates only. */
  priceFromCents?: number;
  priceToCents?: number;
  unit?: PriceUnit;
  durationMinutes?: number;
  bookingMode?: BookingMode;
};

export type CredentialKind = "license" | "certification" | "insurance" | "registration" | "bond";

export type CredentialSuggestion = {
  kind: CredentialKind;
  label: string;
  /** Plain-language note for the owner (who issues it, when it's needed). */
  note?: string;
  /** Legally required to operate in SC (to the best of our knowledge; verify with the regulator). */
  requiredInSC?: boolean;
};

export type CampaignPreset = {
  key: string;
  title: string;
  /** Months (1–12) when this offer usually goes out in the Lowcountry. */
  months: number[];
  text: Bilingual;
};

export type AuditCheck = {
  key: string;
  label: string;
  /** Why it matters, in words a contractor understands. */
  why: string;
  /** 1 (nice to have) to 3 (critical). */
  weight: 1 | 2 | 3;
};

export type VoiceScript = {
  greeting: Bilingual;
  /** What to do in an emergency. Always hands off to a person. */
  emergency?: { triggers: string[]; instruction: string };
  /** Hard limits for the voice agent. */
  never: string[];
};

export type IndustryConfig = {
  key: string;
  label: string;
  /** Short description shown in pickers. */
  hint: string;
  module: ModuleId;
  /** "available": businesses can sign up. "coming_soon": sales audit only (module not built yet). */
  status: "available" | "coming_soon";
  /** Drives today's core behavior (menus, templates, stage words). */
  businessType: BusinessType;
  /** Most specific schema.org type that exists (see lib/industries/schema-org.ts), plus extra types. */
  schemaOrg: { type: string; additionalTypes?: string[] };
  subjectType: SubjectType;
  bookingModes: BookingMode[];
  services: ServiceItem[];
  /** Words for lead stages, only where they differ from the business type's. */
  stageLabels?: Partial<Record<LeadStage, string>>;
  /** Industry wording for built-in templates (same keys, placeholders and rules as lib/templates/defaults.ts). */
  templates?: Record<string, Bilingual>;
  campaignPresets?: CampaignPreset[];
  /** What to ask a new lead. Shown on the lead page, used by AI assistants and the voice agent. */
  qualifyingQuestions: Bilingual[];
  voice: VoiceScript;
  credentials: CredentialSuggestion[];
  /** Industry-specific checks for the sales audit (the general checks apply to everyone). */
  auditChecks: AuditCheck[];
};
