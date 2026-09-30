import { expect, test } from "@playwright/test";
import { expectNoSideways, nextWeekday, startDemo } from "./helpers";

test("lawn care: a rain delay reaches the whole route in a few taps", async ({ page }) => {
  await startDemo(page, "Lawn care");
  const day = nextWeekday();
  await page.goto(`/today?date=${day}`);
  await expectNoSideways(page);
  const rain = page.getByRole("link", { name: /Rain delay: text \d+ customer/ });
  await expect(rain).toBeVisible();
  await rain.click();
  await page.waitForURL(/today\/notice/);
  await page.getByRole("button", { name: /Send to/ }).click();
  await page.waitForURL(/sent=/);
  await expect(page.getByText(/Sent to \d+ customer/)).toBeVisible({ timeout: 30_000 });

  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
});
