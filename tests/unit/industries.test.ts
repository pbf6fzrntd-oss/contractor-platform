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
