import { APP_NAME } from "@/lib/brand";

/**
 * Placeholders for the legal pages. Fill these in (and have an attorney
 * review the pages) before submitting carrier registration.
 */
export const LEGAL = {
  company: process.env.NEXT_PUBLIC_LEGAL_COMPANY_NAME ?? `${APP_NAME} (company name pending)`,
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@example.com",
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS ?? "Summerville, SC",
  updated: "September 29, 2026",
};
