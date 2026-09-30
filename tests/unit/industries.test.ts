import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LANGUAGES } from "@/lib/business-types";
import { getIndustry, industryGroups, INDUSTRIES, industryChoiceFor, resolveIndustryChoice } from "@/lib/industries";
import { isVerifiedSchemaType } from "@/lib/industries/schema-org";
import { BOOKING_MODES, MODULE_IDS, SUBJECT_TYPES } from "@/lib/industries/types";
import { LEAD_STAGES, stageLabel } from "@/lib/leads/stages";
import { activeModules, moduleNavEntries } from "@/lib/modules/types";
import { buildNavigation } from "@/lib/navigation";
import { defaultTemplatesFor, DEFAULT_TEMPLATES } from "@/lib/templates/defaults";
import { findDefaultTemplate, validateTemplateBody } from "@/lib/templates/validate";
import { parseBusinessForm } from "@/lib/validation/business";
import { MODULES } from "@/modules/registry";
import { PILOT } from "./plans";

describe("industry configs", () => {
  it("have unique keys and valid basics", () => {
    const keys = INDUSTRIES.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const i of INDUSTRIES) {
      expect(i.key, i.key).toMatch(/^[a-z][a-z0-9_]{1,39}$/);
      expect(MODULE_IDS).toContain(i.module);
      expect(SUBJECT_TYPES).toContain(i.subjectType);
      expect(i.bookingModes.length, i.key).toBeGreaterThan(0);
      for (const m of i.bookingModes) expect(BOOKING_MODES).toContain(m);
      expect(i.label.length).toBeGreaterThan(1);
    }
  });

  it("use only schema.org types that really exist", () => {
    for (const i of INDUSTRIES) {
      expect(isVerifiedSchemaType(i.schemaOrg.type), `${i.key}: ${i.schemaOrg.type}`).toBe(true);
      for (const t of i.schemaOrg.additionalTypes ?? []) expect(isVerifiedSchemaType(t), `${i.key}: ${t}`).toBe(true);
      expect(i.schemaOrg.type).not.toBe("ProfessionalService"); // deprecated
    }
  });

  it("have services with sensible, unique keys and price ranges", () => {
    for (const i of INDUSTRIES) {
      expect(i.services.length, i.key).toBeGreaterThan(0);
      const keys = i.services.map((s) => s.key);
      expect(new Set(keys).size, i.key).toBe(keys.length);
      for (const s of i.services) {
        for (const lang of LANGUAGES) expect(s.name[lang].trim(), `${i.key}.${s.key}`).not.toBe("");
        if (s.priceFromCents !== undefined && s.priceToCents !== undefined) expect(s.priceToCents).toBeGreaterThanOrEqual(s.priceFromCents);
        if (s.bookingMode) expect(i.bookingModes, `${i.key}.${s.key}`).toContain(s.bookingMode);
      }
    }
  });

  it("have templates that follow the same rules as the owner's editor", () => {
    for (const i of INDUSTRIES) {
      for (const [key, text] of Object.entries(i.templates ?? {})) {
        const def = findDefaultTemplate(key, i.businessType);
        expect(def, `${i.key}: unknown template ${key}`).toBeDefined();
        expect(def!.businessTypes, `${i.key}: ${key} isn't used by this business type`).toContain(i.businessType);
        for (const lang of LANGUAGES) {
          expect(validateTemplateBody(text[lang], lang, def!), `${i.key}.${key}.${lang}`).toBeNull();
          expect(text[lang], `${i.key}.${key}.${lang} must not add its own STOP line`).not.toMatch(/\bSTOP\b/);
        }
      }
    }
  });

  it("have questions, a voice greeting and hard limits in English and Spanish", () => {
    for (const i of INDUSTRIES) {
      expect(i.qualifyingQuestions.length, i.key).toBeGreaterThanOrEqual(2);
      for (const q of i.qualifyingQuestions) for (const lang of LANGUAGES) expect(q[lang].trim()).not.toBe("");
      for (const lang of LANGUAGES) expect(i.voice.greeting[lang]).toContain("{business_name}");
      expect(i.voice.never.length, i.key).toBeGreaterThan(0);
      expect(i.credentials.length, i.key).toBeGreaterThan(0);
    }
  });

  it("belong to exactly one registered module when available", () => {
    for (const i of INDUSTRIES.filter((x) => x.status === "available")) {
      const owners = MODULES.filter((m) => m.industries.includes(i.key));
      expect(owners.map((m) => m.id), i.key).toEqual([i.module]);
    }
  });
});

describe("tailoring by industry", () => {
  it("keeps generic businesses exactly as before", () => {
    for (const type of ["project", "recurring"] as const) {
      expect(defaultTemplatesFor(type, null)).toEqual(defaultTemplatesFor(type));
      for (const s of LEAD_STAGES) expect(stageLabel(type, s, null)).toBe(stageLabel(type, s));
    }
  });

  it("swaps in industry wording for the same keys, categories and languages", () => {
    const generic = defaultTemplatesFor("project");
    const roofing = defaultTemplatesFor("project", "roofing");
    expect(roofing.map((t) => [t.key, t.language, t.category])).toEqual(generic.map((t) => [t.key, t.language, t.category]));
    expect(roofing.find((t) => t.key === "missed_call_reply" && t.language === "en")?.body).toMatch(/roof/);
    // Templates the industry doesn't override are unchanged.
    expect(roofing.find((t) => t.key === "review_request")).toEqual(generic.find((t) => t.key === "review_request"));
  });

  it("covers every built-in template key it overrides", () => {
    const keys = new Set(DEFAULT_TEMPLATES.map((t) => t.key));
    for (const i of INDUSTRIES) for (const k of Object.keys(i.templates ?? {})) expect(keys.has(k), `${i.key}.${k}`).toBe(true);
  });
});

describe("industry picker", () => {
  it("offers available industries plus an 'other' choice per business type", () => {
    const values = industryGroups().flatMap((g) => g.choices.map((c) => c.value));
    expect(values).toContain("roofing");
    expect(values).toContain("lawn_care");
    expect(values).toContain("other_project");
    expect(values).toContain("other_recurring");
    for (const v of values) {
      const i = getIndustry(v);
      if (i) expect(i.status).toBe("available");
    }
  });

  it("stores 'other' as no industry, and picks the business type from the industry", () => {
    expect(resolveIndustryChoice("other_project")).toEqual({ industry: null, business_type: "project" });
    expect(resolveIndustryChoice("lawn_care")).toEqual({ industry: "lawn_care", business_type: "recurring" });
    expect(resolveIndustryChoice("hvac")).toEqual({ industry: "hvac", business_type: "project" });
    expect(resolveIndustryChoice("bogus")).toBeNull();
    expect(industryChoiceFor({ industry: null, business_type: "recurring" })).toBe("other_recurring");
  });

  it("reads the business form with the picker and with older forms", () => {
    const form = (entries: Record<string, string>) => {
      const f = new FormData();
      for (const [k, v] of Object.entries(entries)) f.set(k, v);
      return f;
    };
    const picked = parseBusinessForm(form({ name: "Top Roof", industry: "roofing" }));
    expect(picked.success && picked.data).toMatchObject({ business_type: "project", industry: "roofing" });
    const legacy = parseBusinessForm(form({ name: "Old Form", business_type: "recurring" }));
    expect(legacy.success && legacy.data).toMatchObject({ business_type: "recurring" });
    expect(legacy.success && legacy.data.industry).toBeUndefined(); // older forms never touch the industry
    expect(parseBusinessForm(form({ name: "X", industry: "made_up" })).success).toBe(false);
  });
});

describe("module framework", () => {
  it("never lets the core (lib/) import module code", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name)) files.push(p);
      }
    };
    walk(path.resolve(import.meta.dirname, "../../lib"));
    const offenders = files.filter((f) => /from\s+["'](@\/modules|(\.\.\/)+modules)\b/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("only activates enabled modules", () => {
    expect(activeModules(MODULES, ["home_services"]).map((m) => m.id)).toEqual(["home_services"]);
    expect(activeModules(MODULES, [])).toEqual([]);
  });

  it("adds no menus for Home Services, so today's navigation is unchanged", () => {
    for (const type of ["project", "recurring"] as const) {
      expect(buildNavigation(type, PILOT, moduleNavEntries(MODULES, ["home_services"]))).toEqual(buildNavigation(type, PILOT));
    }
  });

  it("puts a module's menu items before Settings", () => {
    const extra = [{ href: "/pets", label: "Pets", icon: "customers" as const }];
    const nav = buildNavigation("project", PILOT, extra);
    const all = [...nav.primary, ...nav.more].map((i) => i.href);
    expect(all.indexOf("/pets")).toBeLessThan(all.indexOf("/settings"));
  });
});

import { findUnknownVariables } from "@/lib/templates/render";
import { industriesByModule } from "@/lib/industries";

describe("every industry in every module (Milestone 16)", () => {
  const EXPECTED = [
    "house_cleaning", "pest_control", "pool_service",
    "moving", "pressure_washing", "junk_removal",
    "pet_grooming", "pet_boarding", "mobile_vet", "dog_training",
    "auto_detailing", "auto_repair", "mobile_mechanic", "window_tinting",
  ];

  it("has a config for every industry we plan to sell", () => {
    for (const key of EXPECTED) expect(getIndustry(key), key).toBeDefined();
    for (const g of industriesByModule()) expect(g.industries.length, g.module).toBeGreaterThan(0);
  });

  it("keeps coming-soon industries out of the sign-up picker", () => {
    const values = industryGroups().flatMap((g) => g.choices.map((c) => c.value));
    for (const i of INDUSTRIES.filter((x) => x.status === "coming_soon")) expect(values).not.toContain(i.key);
    // Module A (Recurring Home Services, Milestone 27) is built: its industries can sign up.
    for (const key of ["house_cleaning", "pest_control", "pool_service"]) expect(values).toContain(key);
    // ...unless the business already has one (set by the platform admin for a pilot).
    expect(industryGroups("pet_grooming").flatMap((g) => g.choices.map((c) => c.value))).toContain("pet_grooming");
  });

  it("has campaign presets that follow the marketing template rules", () => {
    for (const i of INDUSTRIES) {
      const keys = (i.campaignPresets ?? []).map((c) => c.key);
      expect(new Set(keys).size, i.key).toBe(keys.length);
      for (const c of i.campaignPresets ?? []) {
        expect(c.key).toMatch(/^campaign_[a-z0-9_]+$/);
        expect(c.months.every((m) => m >= 1 && m <= 12), `${i.key}.${c.key}`).toBe(true);
        for (const lang of LANGUAGES) {
          expect(c.text[lang], `${i.key}.${c.key}.${lang}`).toContain("{business_name}");
          expect(findUnknownVariables(c.text[lang]), `${i.key}.${c.key}.${lang}`).toEqual([]);
          expect(c.text[lang]).not.toMatch(/\bSTOP\b/);
        }
      }
    }
  });

  it("gives pet and mobile-vet voice agents hard medical limits and an emergency hand-off", () => {
    for (const key of ["pet_grooming", "pet_boarding", "mobile_vet", "dog_training"]) {
      const i = getIndustry(key)!;
      expect(i.voice.never.join(" "), key).toMatch(/medical advice/);
      expect(i.voice.emergency?.instruction, key).toMatch(/emergency vet/);
    }
    expect(getIndustry("mobile_vet")!.voice.never.join(" ")).toMatch(/medical records/);
  });

  it("uses the vehicle subject for automotive and pets for pet care", () => {
    for (const i of INDUSTRIES) {
      if (i.module === "automotive") expect(i.subjectType, i.key).toBe("vehicle");
      if (i.module === "pet_care") expect(i.subjectType, i.key).toBe("pet");
    }
  });
});
