import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "./form";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Reset your password</h1>
      <p className="mb-6 text-slate-600">We&apos;ll email you a link to choose a new one.</p>
      <ForgotPasswordForm />
      <p className="mt-6 text-center">
        <Link href="/login" className="link">
          Back to log in
        </Link>
      </p>
    </>
  );
}
