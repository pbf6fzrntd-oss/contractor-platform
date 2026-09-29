import { parseFrequency, parseServiceDay, type Frequency } from "@/lib/automation/schedule";
import { parseDollars } from "@/lib/format";
import { normalizeUSPhone } from "@/lib/phone";

/**
 * Turns a pasted/uploaded spreadsheet (CSV) of customers into clean rows,
 * with a plain-English error for every row that can't be imported.
 */

/** Splits CSV text into rows of cells. Handles quotes, commas in quotes and "" escapes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === "," || ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export type ImportField = "name" | "phone" | "address" | "email" | "service_type" | "frequency" | "service_day" | "price" | "language" | "start_date";

const HEADER_ALIASES: Record<ImportField, string[]> = {
  name: ["name", "customer", "customer name", "client", "full name", "nombre"],
  phone: ["phone", "phone number", "mobile", "cell", "cell phone", "telephone", "telefono"],
  address: ["address", "service address", "street", "direccion"],
  email: ["email", "e-mail", "email address", "correo"],
  service_type: ["service", "service type", "services", "plan", "servicio"],
  frequency: ["frequency", "how often", "schedule", "frecuencia"],
  service_day: ["day", "service day", "mow day", "route day", "dia"],
  price: ["price", "rate", "amount", "cost", "price per visit", "precio"],
  language: ["language", "lang", "idioma"],
  start_date: ["start", "start date", "first service", "since"],
};

export function mapHeaders(header: string[]): Partial<Record<ImportField, number>> {
  const map: Partial<Record<ImportField, number>> = {};
  header.forEach((raw, index) => {
    const h = raw.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [ImportField, string[]][]) {
      if (map[field] === undefined && aliases.includes(h)) map[field] = index;
    }
  });
  return map;
}

export type ImportedCustomer = {
  line: number;
  name: string | null;
  phone: string;
  address: string | null;
  email: string | null;
  language: "en" | "es";
  service_type: string;
  frequency: Frequency;
  service_day: number;
  price_cents: number | null;
  start_date: string | null;
};

export type ImportResult = {
  customers: ImportedCustomer[];
  errors: { line: number; message: string }[];
  missingColumns: ImportField[];
};

const REQUIRED: ImportField[] = ["phone", "service_day"];

function parseDate(input: string): string | null | undefined {
  const s = input.trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return undefined;
}

export function parseCustomerCsv(text: string, defaults: { language: "en" | "es"; serviceType: string }): ImportResult {
  const rows = parseCsv(text);
  if (rows.length === 0) return { customers: [], errors: [{ line: 1, message: "The file is empty." }], missingColumns: [] };

  const columns = mapHeaders(rows[0]);
  const missingColumns = REQUIRED.filter((f) => columns[f] === undefined);
  if (missingColumns.length) return { customers: [], errors: [], missingColumns };

  const customers: ImportedCustomer[] = [];
  const errors: { line: number; message: string }[] = [];
  const seen = new Set<string>();
  const get = (row: string[], f: ImportField) => (columns[f] === undefined ? "" : (row[columns[f]!] ?? "").trim());

  rows.slice(1).forEach((row, i) => {
    const line = i + 2; // spreadsheet row number (header is row 1)
    const phone = normalizeUSPhone(get(row, "phone"));
    if (!phone) return errors.push({ line, message: `Phone "${get(row, "phone")}" isn't a valid US number.` });
    if (seen.has(phone)) return errors.push({ line, message: "Same phone number as an earlier row." });

    const day = parseServiceDay(get(row, "service_day"));
    if (day === null) return errors.push({ line, message: `Service day "${get(row, "service_day")}" isn't a day of the week.` });

    const freqRaw = get(row, "frequency");
    const frequency = freqRaw ? parseFrequency(freqRaw) : "weekly";
    if (!frequency) return errors.push({ line, message: `Frequency "${freqRaw}" should be weekly, every 2 weeks or every 4 weeks.` });

    const price = parseDollars(get(row, "price"));
    if (price === undefined) return errors.push({ line, message: `Price "${get(row, "price")}" isn't a dollar amount.` });

    const start = parseDate(get(row, "start_date"));
    if (start === undefined) return errors.push({ line, message: `Start date "${get(row, "start_date")}" should look like 3/15/2026.` });

    const lang = get(row, "language").toLowerCase();
    const language = /^(es|spanish|espanol|español)$/.test(lang) ? "es" : /^(en|english|ingles|inglés)$/.test(lang) ? "en" : defaults.language;

    seen.add(phone);
    customers.push({
      line,
      name: get(row, "name").slice(0, 100) || null,
      phone,
      address: get(row, "address").slice(0, 300) || null,
      email: get(row, "email").slice(0, 200) || null,
      language,
      service_type: (get(row, "service_type") || defaults.serviceType).slice(0, 60),
      frequency,
      service_day: day,
      price_cents: price,
      start_date: start,
    });
  });

  return { customers, errors, missingColumns };
}

export const IMPORT_FIELD_LABEL: Record<ImportField, string> = {
  name: "Name",
  phone: "Phone",
  address: "Address",
  email: "Email",
  service_type: "Service",
  frequency: "Frequency",
  service_day: "Day",
  price: "Price",
  language: "Language",
  start_date: "Start date",
};
