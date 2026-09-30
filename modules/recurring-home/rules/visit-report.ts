/**
 * Visit reports (pure): what the crew checks off or measures at each visit,
 * per trade, and the short summary the customer gets in their "service
 * complete" text. Private crew notes are never part of the summary.
 */
type Lang = "en" | "es";

export type ReportField =
  | { key: string; type: "check"; label: string; es: string }
  | { key: string; type: "number"; label: string; es: string; unit: string; min: number; max: number; step: number; ideal: [number, number] }
  | { key: string; type: "choice"; label: string; es: string; options: { value: string; label: string; es: string }[] };

const check = (key: string, label: string, es: string): ReportField => ({ key, type: "check", label, es });

const FIELDS: Record<string, ReportField[]> = {
  pool_service: [
    { key: "chlorine", type: "number", label: "Free chlorine", es: "Cloro libre", unit: "ppm", min: 0, max: 20, step: 0.5, ideal: [1, 4] },
    { key: "ph", type: "number", label: "pH", es: "pH", unit: "", min: 6, max: 9, step: 0.1, ideal: [7.2, 7.8] },
    { key: "alkalinity", type: "number", label: "Alkalinity", es: "Alcalinidad", unit: "ppm", min: 0, max: 300, step: 10, ideal: [80, 120] },
    check("skimmed", "Skimmed", "Superficie limpia"),
    check("brushed", "Brushed walls and steps", "Paredes cepilladas"),
    check("vacuumed", "Vacuumed", "Aspirada"),
    check("baskets", "Emptied baskets", "Canastas vaciadas"),
    check("filter", "Cleaned filter / backwashed", "Filtro limpio"),
  ],
  pest_control: [
    check("interior", "Treated inside", "Interior tratado"),
    check("perimeter", "Treated outside perimeter", "Perímetro exterior tratado"),
    check("eaves", "Swept webs from eaves", "Telarañas retiradas"),
    check("granules", "Spread granules in the yard", "Gránulos en el jardín"),
    check("bait", "Checked bait stations", "Estaciones de cebo revisadas"),
    check("mosquito", "Mosquito treatment", "Tratamiento de mosquitos"),
    {
      key: "activity",
      type: "choice",
      label: "Pest activity seen",
      es: "Actividad de plagas",
      options: [
        { value: "none", label: "None", es: "Ninguna" },
        { value: "light", label: "Light", es: "Poca" },
        { value: "heavy", label: "Heavy", es: "Mucha" },
      ],
    },
  ],
  house_cleaning: [
    check("kitchen", "Kitchen", "Cocina"),
    check("bathrooms", "Bathrooms", "Baños"),
    check("bedrooms", "Bedrooms", "Habitaciones"),
    check("living", "Living areas", "Sala"),
    check("floors", "Floors vacuumed and mopped", "Pisos aspirados y trapeados"),
    check("dusting", "Dusting", "Polvo"),
    check("trash", "Trash taken out", "Basura sacada"),
  ],
  lawn_care: [
    check("mowed", "Mowed", "Césped cortado"),
    check("edged", "Edged", "Bordes"),
    check("blown", "Blown off drive and walks", "Entrada y aceras sopladas"),
    check("beds", "Weeded beds", "Canteros deshierbados"),
  ],
  landscaping: [
    check("mowed", "Mowed", "Césped cortado"),
    check("beds", "Weeded and cleaned beds", "Canteros limpios"),
    check("shrubs", "Trimmed shrubs", "Arbustos podados"),
    check("blown", "Blown off hard surfaces", "Superficies sopladas"),
  ],
};

export function reportFields(industry: string | null): ReportField[] {
  return FIELDS[industry ?? ""] ?? [check("done", "Service completed", "Servicio completado")];
}

export type ReportValues = Record<string, boolean | number | string>;

/** Reads the report form: ticked boxes, readings in range, known choices. Unknown keys are ignored. */
export function parseReportValues(fields: ReportField[], form: { get: (k: string) => unknown }): { ok: true; values: ReportValues } | { ok: false; error: string } {
  const values: ReportValues = {};
  for (const f of fields) {
    const raw = form.get(f.key);
    if (f.type === "check") {
      if (raw === "on") values[f.key] = true;
    } else if (f.type === "number") {
      const text = String(raw ?? "").trim();
      if (!text) continue;
      const n = Number(text);
      if (!Number.isFinite(n) || n < f.min || n > f.max) return { ok: false, error: `${f.label} should be between ${f.min} and ${f.max}.` };
      values[f.key] = Math.round(n * 10) / 10;
    } else {
      const v = String(raw ?? "");
      if (v && f.options.some((o) => o.value === v)) values[f.key] = v;
    }
  }
  return { ok: true, values };
}

/** Readings outside the healthy range (for the owner, e.g. "pH 8.2 is high"). */
export function outOfRange(fields: ReportField[], values: ReportValues): string[] {
  const out: string[] = [];
  for (const f of fields) {
    if (f.type !== "number" || typeof values[f.key] !== "number") continue;
    const v = values[f.key] as number;
    if (v < f.ideal[0]) out.push(`${f.label} ${v}${f.unit ? ` ${f.unit}` : ""} is low`);
    else if (v > f.ideal[1]) out.push(`${f.label} ${v}${f.unit ? ` ${f.unit}` : ""} is high`);
  }
  return out;
}

/** The customer-facing summary: readings, then what was done. */
export function summarizeReport(fields: ReportField[], values: ReportValues, lang: Lang): string {
  const parts: string[] = [];
  const readings = fields.filter((f) => f.type === "number" && typeof values[f.key] === "number");
  if (readings.length) parts.push(readings.map((f) => `${lang === "es" ? f.es : f.label} ${values[f.key]}${f.type === "number" && f.unit ? ` ${f.unit}` : ""}`).join(", "));
  const done = fields.filter((f) => f.type === "check" && values[f.key] === true).map((f) => (lang === "es" ? f.es : f.label).toLowerCase());
  if (done.length) parts.push(`${lang === "es" ? "Hecho" : "Done"}: ${done.join(", ")}`);
  for (const f of fields) {
    if (f.type !== "choice" || typeof values[f.key] !== "string") continue;
    const o = f.options.find((x) => x.value === values[f.key]);
    if (o) parts.push(`${lang === "es" ? f.es : f.label}: ${(lang === "es" ? o.es : o.label).toLowerCase()}`);
  }
  return parts.join(". ");
}

/** "Service complete" text. The STOP line is added by the send pipeline when needed. */
export function serviceCompleteText(lang: Lang, business: string, service: string, summary: string, note: string | null): string {
  const extra = [summary, note?.trim().replace(/[.!\s]+$/, "")].filter(Boolean).join(". ");
  return lang === "es"
    ? `${business}: Terminamos su servicio de hoy (${service}).${extra ? ` ${extra}.` : ""} ¡Gracias!`
    : `${business}: Your ${service.toLowerCase()} is done for today.${extra ? ` ${extra}.` : ""} Thank you!`;
}
