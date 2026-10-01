import { expect, test } from "@playwright/test";
import { expectNoSideways, nextWeekday, startDemo } from "./helpers";

test("lawn care: a rain delay reaches the whole route in a few taps", async ({ page }) => {
  await startDemo(page, "Lawn care");
  const day = nextWeekday();
  await page.goto(`/today?date=${day}`);
  await expectNoSideways(page);
  const rain = page.getByRole("link", { name: /Rain delay: text \d+ customer/ });
  await expect(rain).toBeVisible();
  const recipients = Number((await rain.innerText()).match(/text (\d+)/)?.[1]);
  expect(recipients).toBeGreaterThan(0);
  await rain.click();
  await page.waitForURL(/today\/notice/);
  await page.getByRole("button", { name: /Send to/ }).click();
  await page.waitForURL(/sent=/);
  // Quiet hours legitimately queue the notice. Advance only the simulator,
  // then require confirmed sends for this broadcast rather than weakening the check.
  const resultUrl = page.url();
  await expect(page.getByRole("status")).toContainText(/Queued|Sending|Sent to/);
  await page.goto("/simulator");
  await page.getByRole("button", { name: "⏩ Skip ahead" }).click();
  await expect(page.getByText(/^Sent \d+, skipped/)).toBeVisible();
  await page.goto(resultUrl);
  await expect(page.getByRole("status")).toContainText(`Sent to ${recipients} customer`);

  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
});
