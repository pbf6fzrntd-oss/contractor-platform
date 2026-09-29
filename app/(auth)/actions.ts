"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/form-message";
import { publicEnv } from "@/lib/env-public";
import { safeNextPath } from "@/lib/redirects";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "That email and password don't match. Try again." };

  redirect(safeNextPath(formData.get("next")?.toString()));
}

const signupSchema = z.object({
  full_name: z.string().trim().min(1, "Enter your name.").max(100),
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters for your password."),
});

export async function signup(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const next = safeNextPath(formData.get("next")?.toString(), "/onboarding");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name },
      emailRedirectTo: `${publicEnv.siteUrl}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return { error: error.message };

  // If email confirmation is turned off in Supabase, they're logged in now.
  if (data.session) redirect(next);
  return { success: "Check your email and tap the link to confirm your account." };
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = z.string().trim().email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${publicEnv.siteUrl}/auth/confirm?next=/reset-password`,
  });
  // Same message whether or not the account exists, so nobody can probe for emails.
  return { success: "If that email has an account, a reset link is on its way." };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Couldn't update your password. Request a new reset link and try again." };
  redirect("/home");
}
