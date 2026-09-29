/** Ways a customer can give written consent to promotional texts (shown in forms and the consent log). */
export const MARKETING_CONSENT_METHODS = {
  written_agreement: "Signed service agreement",
  web_form: "Online form",
  text_keyword: "Texted YES to opt in",
} as const;
export type MarketingConsentMethod = keyof typeof MARKETING_CONSENT_METHODS;
