"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-loads the page's data every few seconds so new texts show up without tapping refresh. */
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
