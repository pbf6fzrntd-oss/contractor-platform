import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ResetPasswordForm } from "./form";

export const metadata: Metadata = { title: "New password" };

export default function ResetPasswordPage() {
  return (
    <>
      <PageHeader title="Choose a new password" />
      <ResetPasswordForm />
    </>
  );
}
