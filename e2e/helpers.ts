import { expect, type Page } from "@playwright/test";

/** Starts a fresh "Try it live" demo business for a trade (by its label on /demo). */
export async function startDemo(page: Page, trade: string) {
  await page.goto("/demo");
  await page.locator("form button", { hasText: trade }).first().click();
  await page.waitForURL(/welcome=1/, { timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Demo" })).toBeVisible();
}

/** Opens the demo bar's "Try it" panel if it's closed. */
export async function openTryIt(page: Page) {
  const toggle = page.getByRole("button", { name: /Try it|Hide/ });
  if ((await toggle.textContent())?.includes("Try it")) await toggle.click();
}

/** The next weekday (YYYY-MM-DD), for pages that show one day. */
export function nextWeekday(): string {
  const d = new Date();
  do d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6);
  return d.toISOString().slice(0, 10);
}

/** The page must not scroll sideways (a common phone layout bug). */
export async function expectNoSideways(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}
