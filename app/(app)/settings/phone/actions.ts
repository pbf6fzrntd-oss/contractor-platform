"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form-message";
import { requireOwner } from "@/lib/auth/context";
import { normalizeUSPhone } from "@/lib/phone";
import { provisionBusinessNumber } from "@/lib/services/phone-numbers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function getBusinessNumber(_prev: FormState, formData: FormData): Promise<FormState> {
  const { org } = await requireOwner();
  if (org.is_demo) return { error: "Demo businesses use a pretend number. Sign up to get a real one." };
  const areaCode = String(formData.get("area_code") ?? "").replace(/\D/g, "");
  if (areaCode && !/^[2-9]\d{2}$/.test(areaCode)) return { error: "Enter a 3-digit area code, like 843." };
  const result = await provisionBusinessNumber(createAdminClient(), org.id, areaCode);
  if (result.error) return { error: result.error };
  revalidatePath("/", "layout");
  return { success: "Your business number is ready." };
}

const setupSchema = z.object({
  phone_id: z.string().uuid(),
  setup_mode: z.enum(["forward_when_unanswered", "new_number"]),
  forward_to: z.string().optional(),
});

export async function updatePhoneSetup(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireOwner();
  const parsed = setupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Pick how you want calls handled." };

  const forwardTo = parsed.data.forward_to ? normalizeUSPhone(parsed.data.forward_to) : null;
  if (parsed.data.setup_mode === "new_number" && !forwardTo) {
    return { error: "Enter the cell number calls should ring first." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("phone_numbers")
    .update({ setup_mode: parsed.data.setup_mode, forward_to: forwardTo })
    .eq("id", parsed.data.phone_id);
  if (error) return { error: "Couldn't save. Please try again." };
  revalidatePath("/settings/phone");
  return { success: "Saved." };
}
