import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAppContext, getUserId } from "@/lib/auth/context";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your business" };

export default async function OnboardingPage() {
  if (!(await getUserId())) redirect("/login");
  if (await getAppContext()) redirect("/home");

  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <h1 className="text-2xl font-bold">Set up your business</h1>
      <p className="mb-6 mt-1 text-slate-600">
        This sets up your menus and ready-to-use text messages (English and Spanish). You can change any of it later.
      </p>
      <OnboardingForm />
    </main>
  );
}
