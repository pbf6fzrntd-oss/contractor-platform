import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { UpgradeNote } from "@/components/upgrade-note";
import { requireOwner } from "@/lib/auth/context";
import { bookingOn, canUse } from "@/lib/entitlements";
import { publicEnv } from "@/lib/env-public";
import { profileSettingsSchema, slugify } from "@/lib/public/profile";
import { ProfileForm } from "./form";

export const metadata: Metadata = { title: "Public profile" };

export default async function PublicProfileSettingsPage() {
  const { org, plan, modules } = await requireOwner();
  if (!canUse(plan, modules, "agent_ready")) {
    return (
      <>
        <PageHeader title="Public profile" backHref="/settings" />
        <UpgradeNote feature="Your public profile" />
      </>
    );
  }
  const saved = profileSettingsSchema.safeParse(org.profile);
  const p = saved.success ? saved.data : {};
  const slug = org.slug ?? slugify(org.name);
  const live = org.public_profile_enabled && Boolean(org.slug);
  const base = `${publicEnv.siteUrl}/b/${slug}`;
  const booking = bookingOn(org, plan, modules);

  return (
    <>
      <PageHeader
        title="Public profile"
        subtitle="A page about your business that customers, Google and AI assistants (ChatGPT, Claude, Siri) can read, with your services, prices, licenses and online booking."
        backHref="/settings"
      />
      <ProfileForm enabled={org.public_profile_enabled} slug={slug} about={p.about ?? ""} area={p.service_area ?? ""} showPrices={p.show_prices ?? true} site={publicEnv.siteUrl} />
      {live && (
        <section className="card mt-4 flex flex-col gap-2 text-sm">
          <h2 className="font-semibold">Your links</h2>
          <p>Profile: <Link href={`/b/${slug}`} className="text-brand-700 underline">{base}</Link></p>
          {booking ? (
            <>
              <p>Booking page: <Link href={`/b/${slug}/book`} className="text-brand-700 underline">{base}/book</Link></p>
              <p>For customers&apos; AI agents: <span className="select-all font-mono text-xs">{publicEnv.siteUrl}/api/agent/{slug}</span></p>
            </>
          ) : (
            <p className="text-slate-600">Turn on <Link href="/settings/booking" className="underline">Online booking</Link> to add a booking page and let customers&apos; AI agents book.</p>
          )}
          <p>AI summary: <Link href={`/b/${slug}/llms.txt`} className="text-brand-700 underline">{base}/llms.txt</Link></p>
          <p className="text-slate-600">Put the profile link on your Google Business Profile and website. Online bookings wait for your OK unless you change Approval rules.</p>
        </section>
      )}
      <p className="mt-4 text-sm text-slate-600">
        Also shown: your business number, Google review link, <Link href="/settings/licenses" className="underline">licenses & insurance</Link> you&apos;ve marked public, and services from Online booking. Customers&apos; details are never shown.
      </p>
    </>
  );
}
