import type { AuditCheck, Bilingual, CredentialSuggestion, VoiceScript } from "@/lib/industries/types";

/** Pieces several industry configs share. */

export const NEVER_QUOTE_OR_PROMISE = [
  "Never quote a firm price. Give the typical range only and say the owner confirms the exact price.",
  "Never promise a date or arrival time the owner hasn't set.",
];

export function voice(greeting: Bilingual, emergency?: VoiceScript["emergency"], extraNever: string[] = []): VoiceScript {
  return { greeting, emergency, never: [...NEVER_QUOTE_OR_PROMISE, ...extraNever] };
}

export const LIABILITY: CredentialSuggestion = {
  kind: "insurance",
  label: "General liability insurance",
  note: "Customers and property managers often ask for a certificate.",
};

export const WORKERS_COMP: CredentialSuggestion = {
  kind: "insurance",
  label: "Workers' compensation insurance",
  note: "Required in SC once you have 4 or more employees.",
};

export const CHECK = {
  licenseVisible: {
    key: "license_visible",
    label: "License and insurance shown on the website",
    why: "Customers and AI assistants look for proof you're licensed and insured before recommending you.",
    weight: 2,
  },
  photos: { key: "project_photos", label: "Photos of real past jobs", why: "Before-and-after photos build trust faster than any description.", weight: 1 },
  serviceArea: {
    key: "service_area",
    label: "Service area (towns or ZIP codes) listed",
    why: "AI assistants check whether you cover the customer's area before recommending you.",
    weight: 2,
  },
  priceRanges: {
    key: "price_ranges",
    label: "Starting prices or price ranges published",
    why: "AI assistants can't recommend you for a budget if they can't find any prices.",
    weight: 2,
  },
  onlineBooking: {
    key: "book_online",
    label: "Customers can book or request a time online",
    why: "AI assistants and busy customers pick businesses they can book without a phone call.",
    weight: 3,
  },
  policies: {
    key: "policies",
    label: "Cancellation and payment policies written down",
    why: "Clear policies cut no-shows and let AI assistants answer customers' questions for you.",
    weight: 1,
  },
} satisfies Record<string, AuditCheck>;
