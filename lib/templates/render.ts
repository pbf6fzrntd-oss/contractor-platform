import { TEMPLATE_VARIABLES, type TemplateVariable } from "@/lib/templates/defaults";

export type TemplateValues = Partial<Record<TemplateVariable, string | null | undefined>>;

const PLACEHOLDER = /\{([a-z_]+)\}/g;

function isKnownVariable(name: string): name is TemplateVariable {
  return (TEMPLATE_VARIABLES as readonly string[]).includes(name);
}

/**
 * Fills in {placeholders}. A missing value (e.g. we don't know the customer's
 * name yet) is dropped and the punctuation around it tidied, so
 * "Hi {first_name}, it's Joe's" becomes "Hi, it's Joe's".
 * Unknown placeholders are left as-is so typos are visible in previews.
 */
export function renderTemplate(body: string, values: TemplateValues): string {
  return body
    .replace(PLACEHOLDER, (match, name: string) => {
      if (!isKnownVariable(name)) return match;
      return values[name]?.trim() ?? "";
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?;:])/g, "$1")
    .replace(/,([.!?])/g, "$1")
    .trim();
}

/** Placeholders in a template that we don't recognize (probably typos). */
export function findUnknownVariables(body: string): string[] {
  const unknown = new Set<string>();
  for (const [, name] of body.matchAll(PLACEHOLDER)) {
    if (!isKnownVariable(name)) unknown.add(name);
  }
  return [...unknown];
}
