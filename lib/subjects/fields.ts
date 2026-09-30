import { z } from "zod";
import type { SubjectType } from "@/lib/industries/types";

/**
 * What a business keeps about the thing it services for a customer:
 * a property, a pet or a vehicle. Plain details go in subjects.attributes;
 * secrets (codes, VINs, behavior and care notes) go in subject_private and
 * are only ever shown to the business's own team, inside the app.
 */

export type FieldDef = {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "boolean";
  options?: { value: string; label: string }[];
  placeholder?: string;
  max?: number;
};

export type PrivateFieldDef = { key: "access_notes" | "vin" | "behavior_notes" | "care_notes"; label: string; hint: string; placeholder?: string };

export const SUBJECT_LABELS: Record<SubjectType, { one: string; add: string }> = {
  property: { one: "Property", add: "Add property details" },
  pet: { one: "Pet", add: "Add a pet" },
  vehicle: { one: "Vehicle", add: "Add a vehicle" },
};

export const SUBJECT_FIELDS: Record<SubjectType, FieldDef[]> = {
  property: [
    { key: "address", label: "Service address", type: "text", placeholder: "123 Main St, Summerville", max: 200 },
    {
      key: "property_type",
      label: "Type",
      type: "select",
      options: [
        { value: "house", label: "House" },
        { value: "townhome", label: "Townhome / condo" },
        { value: "rental", label: "Rental / vacation rental" },
        { value: "commercial", label: "Business" },
      ],
    },
    { key: "stories", label: "Stories", type: "number", max: 5 },
  ],
  pet: [
    { key: "name", label: "Pet's name", type: "text", max: 60 },
    {
      key: "species",
      label: "Species",
      type: "select",
      options: [
        { value: "dog", label: "Dog" },
        { value: "cat", label: "Cat" },
        { value: "other", label: "Other" },
      ],
    },
    { key: "breed", label: "Breed", type: "text", max: 60 },
    {
      key: "size",
      label: "Size",
      type: "select",
      options: [
        { value: "small", label: "Small (under 25 lb)" },
        { value: "medium", label: "Medium (25–50 lb)" },
        { value: "large", label: "Large (50–90 lb)" },
        { value: "xl", label: "Extra large (90+ lb)" },
      ],
    },
    { key: "birth_year", label: "Birth year", type: "number" },
    { key: "fixed", label: "Spayed / neutered", type: "boolean" },
  ],
  vehicle: [
    { key: "year", label: "Year", type: "number" },
    { key: "make", label: "Make", type: "text", max: 40 },
    { key: "model", label: "Model", type: "text", max: 40 },
    { key: "color", label: "Color", type: "text", max: 30 },
    {
      key: "size_class",
      label: "Size",
      type: "select",
      options: [
        { value: "car", label: "Car" },
        { value: "small_suv", label: "Small SUV / crossover" },
        { value: "large_suv", label: "Large SUV / minivan" },
        { value: "truck", label: "Truck" },
        { value: "van", label: "Van / oversized" },
      ],
    },
  ],
};

export const PRIVATE_FIELDS: Record<SubjectType, PrivateFieldDef[]> = {
  property: [
    { key: "access_notes", label: "Access notes (private)", hint: "Gate code, lockbox, alarm, dogs in the yard. Only your team sees this; it's never texted or shared.", placeholder: "Gate 4821#, lockbox on back door" },
  ],
  pet: [
    { key: "behavior_notes", label: "Behavior notes (private)", hint: "Nervous, reactive, bites, doesn't like other dogs. Only your team sees this.", placeholder: "Nervous with nail trims" },
    { key: "care_notes", label: "Care notes (private)", hint: "Feeding and handling instructions from the owner. Not medical records.", placeholder: "1 cup twice a day" },
  ],
  vehicle: [{ key: "vin", label: "VIN (private)", hint: "17 characters. Only your team sees this; it's never texted or shared.", placeholder: "1HGCM82633A004352" }],
};

/** Turns a form into clean attributes + private fields for one subject kind. */
export function parseSubjectForm(kind: SubjectType, form: FormData) {
  const attributes: Record<string, string | number | boolean> = {};
  const problems: string[] = [];
  for (const f of SUBJECT_FIELDS[kind]) {
    const raw = form.get(f.key);
    if (f.type === "boolean") {
      if (raw !== null) attributes[f.key] = raw === "on" || raw === "true";
      continue;
    }
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) continue;
    if (f.type === "number") {
      const n = Number(value);
      const valid = Number.isInteger(n) && n >= 0 && (f.key !== "year" || (n >= 1950 && n <= 2100)) && (f.key !== "birth_year" || (n >= 1990 && n <= 2100)) && (!f.max || n <= f.max);
      if (!valid) problems.push(`${f.label} doesn't look right.`);
      else attributes[f.key] = n;
    } else if (f.type === "select") {
      if (f.options?.some((o) => o.value === value)) attributes[f.key] = value;
      else problems.push(`Pick a ${f.label.toLowerCase()} from the list.`);
    } else {
      attributes[f.key] = value.slice(0, f.max ?? 120);
    }
  }
  const privateFields: Record<string, string | null> = {};
  for (const f of PRIVATE_FIELDS[kind]) {
    const value = String(form.get(f.key) ?? "").trim();
    if (f.key === "vin") {
      const vin = value.toUpperCase().replace(/[\s-]/g, "");
      if (vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) problems.push("A VIN is 17 letters and numbers (no I, O or Q).");
      privateFields.vin = vin || null;
    } else {
      privateFields[f.key] = value.slice(0, 1000) || null;
    }
  }
  const label = subjectLabel(kind, attributes);
  return problems.length ? { ok: false as const, error: problems[0] } : { ok: true as const, attributes, privateFields, label };
}

/** "Buddy (Golden Retriever)", "2019 Honda CR-V", "123 Main St". */
export function subjectLabel(kind: SubjectType, a: Record<string, unknown>): string {
  const str = (k: string) => (typeof a[k] === "string" || typeof a[k] === "number" ? String(a[k]) : "");
  if (kind === "pet") return [str("name") || "Pet", str("breed") ? `(${str("breed")})` : ""].filter(Boolean).join(" ");
  if (kind === "vehicle") return [str("year"), str("make"), str("model")].filter(Boolean).join(" ") || "Vehicle";
  return str("address") || "Property";
}

/**
 * The ONLY view of a subject that may leave the app's own screens (AI
 * assistant answers, texts, public pages). Built from an allow-list of plain
 * fields, so private details can't slip through even if they're passed in.
 */
const SHAREABLE: Record<SubjectType, string[]> = {
  property: ["property_type", "stories"],
  pet: ["name", "species", "breed", "size", "birth_year"],
  vehicle: ["year", "make", "model", "color", "size_class"],
};

export function shareableSubject(s: { id: string; kind: string; label: string; attributes: unknown }) {
  const kind = (["property", "pet", "vehicle"] as const).find((k) => k === s.kind);
  if (!kind) return null;
  const attrs = (s.attributes ?? {}) as Record<string, unknown>;
  const details = Object.fromEntries(SHAREABLE[kind].filter((k) => attrs[k] !== undefined).map((k) => [k, attrs[k]]));
  return { subject_id: s.id, kind, name: kind === "property" ? SUBJECT_LABELS.property.one : s.label, details };
}

export const subjectAttributesSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));
