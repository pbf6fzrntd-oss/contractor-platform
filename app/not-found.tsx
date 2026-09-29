import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-slate-600">That page doesn&apos;t exist or you don&apos;t have access to it.</p>
      <Link href="/home" className="btn-primary">
        Go to the app
      </Link>
    </main>
  );
}
