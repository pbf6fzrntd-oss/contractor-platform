"use client";

import { useActionState, useRef, useState } from "react";
import { FormMessage, type FormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";

const MAX_SIDE = 2000;

/**
 * Shrinks a phone photo before upload (big photos are 3–8 MB; this makes them
 * ~0.5–1 MB), so uploads stay fast on cell service and under the 4 MB limit.
 */
async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 900_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

export function FileUpload({
  action,
  accept = "image/*",
  label = "Add a photo",
  children,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  accept?: string;
  label?: string;
  children?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {children}
      <label className="btn-secondary cursor-pointer text-sm">
        {busy ? "Preparing…" : label}
        <input
          ref={input}
          type="file"
          name="file"
          accept={accept}
          className="sr-only"
          onChange={async (e) => {
            const picked = e.target.files?.[0];
            if (!picked) return;
            setBusy(true);
            const small = await shrinkImage(picked);
            if (small !== picked && input.current) {
              const dt = new DataTransfer();
              dt.items.add(small);
              input.current.files = dt.files;
            }
            setBusy(false);
            e.target.form?.requestSubmit();
          }}
        />
      </label>
      <noscript>
        <SubmitButton className="btn-secondary text-sm">Upload</SubmitButton>
      </noscript>
      <FormMessage state={state} />
    </form>
  );
}
