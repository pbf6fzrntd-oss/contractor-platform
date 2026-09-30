import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { APP_NAME } from "@/lib/brand";
import { serverEnv } from "@/lib/env";
import { demoIndustries } from "@/lib/services/demo";
import { startDemo } from "./actions";
import { TradePicker } from "./trade-picker";

export const metadata: Metadata = { title: "Try it live", robots: { index: false } };
export const dynamic = "force-dynamic";

const ICONS: Record<string, string> = {
  lawn_care: "🌱", landscaping: "🌳", pest_control: "🐜", pool_service: "🏊", house_cleaning: "🧽", roofing: "🏠", hvac: "❄️", plumbing: "🚿", electrical: "💡",
  remodeling: "🔨", painting: "🎨", gutters: "🌧", fencing: "🚧", tree_service: "🪓", handyman: "🧰",
};

/** "Try it live": pick your trade and get your own demo business, full of realistic activity. */
export default function DemoPage() {
  if (!serverEnv.demoMode) notFound();
  const trades = demoIndustries().map((i) => ({ key: i.key, label: i.label, hint: i.hint, icon: ICONS[i.key] ?? "🛠" }));
  const actions = Object.fromEntries(trades.map((t) => [t.key, startDemo.bind(null, t.key)]));

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-[max(2rem,env(safe-area-inset-top))] lg:pt-14">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">{APP_NAME} · Live demo</p>
      <h1 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">See it running for a business like yours.</h1>
      <p className="mt-3 max-w-2xl text-lg text-slate-600">
        Pick your trade. You&apos;ll get your own practice business with three months of real-looking calls, texts, estimates and jobs. Click anything. Nothing you do texts a real phone.
      </p>

      <section className="mt-8">
        <TradePicker trades={trades} actions={actions} />
      </section>

      <section className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          ["📞", "Miss a call on purpose", "Watch the caller get a text back in seconds, then reply as the customer."],
          ["💬", "Work the inbox", "Every call and text in one list. Send an estimate and see the follow-ups line up."],
          ["📈", "See the money", "The dashboard shows what came in, what was won and what's still waiting."],
        ].map(([icon, title, text]) => (
          <div key={title} className="card">
            <p className="text-2xl" aria-hidden="true">{icon}</p>
            <h2 className="mt-1 font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">{text}</p>
          </div>
        ))}
      </section>
      <p className="mt-8 text-sm text-slate-500">
        Demo businesses are deleted after 24 hours. Already a customer? <Link href="/login" className="font-medium text-brand-700 underline">Log in</Link>
      </p>
    </main>
  );
}
