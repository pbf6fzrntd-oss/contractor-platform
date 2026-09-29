import type { Metadata } from "next";
import Link from "next/link";
import { login } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  const nextPath = typeof next === "string" ? next : undefined;

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">Log in</h1>
      {error === "confirm" && (
        <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
          That confirmation link didn&apos;t work or has expired. Try logging in, or sign up again.
        </p>
      )}
      <AuthForm mode="login" action={login} next={nextPath} />
      <p className="mt-6 text-center text-slate-600">
        New here?{" "}
        <Link href={nextPath ? `/signup?next=${encodeURIComponent(nextPath)}` : "/signup"} className="link">
          Create an account
        </Link>
      </p>
    </>
  );
}
