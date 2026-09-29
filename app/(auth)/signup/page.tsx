import type { Metadata } from "next";
import Link from "next/link";
import { signup } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { next } = await searchParams;
  const nextPath = typeof next === "string" ? next : undefined;

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Create your account</h1>
      <p className="mb-6 text-slate-600">Takes about a minute. Next, you&apos;ll set up your business.</p>
      <AuthForm mode="signup" action={signup} next={nextPath} />
      <p className="mt-6 text-center text-slate-600">
        Already have an account?{" "}
        <Link href={nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login"} className="link">
          Log in
        </Link>
      </p>
    </>
  );
}
