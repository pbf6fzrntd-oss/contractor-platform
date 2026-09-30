import { expect, test } from "@playwright/test";
import { startDemo } from "./helpers";

/** Module A: a pool company finishes a stop with readings and texts the customer. */
test("a pool tech files a visit report and the customer gets a 'service complete' text", async ({ page }) => {
  await startDemo(page, "Pool");

  // Agreements come pre-filled in the demo, with some renewing soon.
  await page.goto("/agreements");
  await expect(page.getByText(/Coming up \(\d+\)/)).toBeVisible();

  // Pick a stop on a weekday route and open its report.
  let found = false;
  for (let i = 0; i < 7 && !found; i++) {
    const d = new Date(Date.now() + i * 86_400_000).toISOString().slice(0, 10);
    await page.goto(`/today?date=${d}`);
    // Demo route order varies and includes Spanish-speaking customers.
    // This scenario asserts the English text and needs an unfinished English stop.
    const stop = page.getByRole("listitem").filter({
      has: page.getByRole("link", { name: "Report", exact: true }),
      hasNot: page.getByText(/^ES(?:\\s|$)/),
    }).filter({ hasNot: page.getByLabel("Done", { exact: true }) }).first();
    const report = stop.getByRole("link", { name: "Report", exact: true });
    if (await report.count()) {
      await report.click();
      found = true;
    }
  }
  expect(found).toBe(true);
  await page.waitForURL(/\/visits\/new/);

  await page.locator("input[name=chlorine]").fill("3");
  await page.locator("input[name=ph]").fill("8.2");
  await page.getByText("Skimmed", { exact: true }).click();
  await page.getByText("Vacuumed", { exact: true }).click();
  await page.locator("#customer_note").fill("Added a bag of shock");
  await page.locator("#private_note").fill("Side gate latch is broken");
  // The customer's text is previewed live, without the private crew note.
  const preview = page.getByText(/is done for today\. Free chlorine 3 ppm, pH 8\.2\. Done: skimmed, vacuumed\. Added a bag of shock\. Thank you!/);
  await expect(preview).toBeVisible();
  await page.getByRole("button", { name: "Save visit" }).click();

  await page.waitForURL(/\/visits\/[0-9a-f-]{36}/);
  await expect(page.getByText("✓ Visit saved.")).toBeVisible();
  // Sent now, or queued until business hours if the test runs late at night.
  await expect(page.getByText(/The customer just got their text|Their text goes out when business hours start/)).toBeVisible();
  await expect(page.getByText("pH 8.2 is high")).toBeVisible();
  await expect(page.getByText("Side gate latch is broken")).toBeVisible();
});
