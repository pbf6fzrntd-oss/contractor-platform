import "server-only";
import { cache } from "react";
import { publicEnv } from "@/lib/env";
import { loadPublicBusiness } from "@/lib/services/public-booking";
import { createAdminClient } from "@/lib/supabase/admin";

/** The public business for a slug (null if its profile isn't live). Cached per request. */
export const getPublicBusiness = cache(async (slug: string) => loadPublicBusiness(createAdminClient(), slug.toLowerCase()));

export function publicUrls(slug: string, bookingAvailable: boolean) {
  const base = `${publicEnv.siteUrl}/b/${slug}`;
  return {
    page: base,
    booking: bookingAvailable ? `${base}/book` : null,
    agent: bookingAvailable ? `${publicEnv.siteUrl}/api/agent/${slug}` : null,
  };
}
