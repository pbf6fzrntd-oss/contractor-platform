import { expect, test } from "@playwright/test";

test("a new owner signs up, sets up their business and gets a text-back working", async ({ page }) => {
  const email = `owner-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.example.com`;
  await page.goto("/signup");
  await page.locator("#full_name").fill("Terry Tester");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("password123");
  await page.locator("button[type=submit]").click();
  await page.waitForURL(/onboarding/);

  await page.locator("#name").fill("Tester Roofing");
  await page.locator("#industry").selectOption("roofing");
  await page.locator("#alert_phone").fill("843-555-0188");
  await page.locator("button[type=submit]").click();
  await page.waitForURL(/\/inbox/);
  // New owners see what's left to set up.
  await expect(page.getByRole("region", { name: "Finish setting up" })).toBeVisible();
  await expect(page.getByText("Next: Get your business texting number")).toBeVisible();

  // A pretend business number, then a pretend missed call from the simulator.
  await page.goto("/settings/phone");
  await page.getByRole("button", { name: "Get my business number" }).click();
  await expect(page.getByText("Your business number")).toBeVisible();
  await page.goto("/simulator?from=" + encodeURIComponent("(843) 555-0177"));
  await page.getByRole("button", { name: /Call and nobody answers/ }).click();
  await expect(page.getByText(/Missed call logged/)).toBeVisible();
  await page.goto("/inbox");
  await expect(page.getByText("(843) 555-0177").first()).toBeVisible();

  // The "test it" step is now done.
  await page.goto("/settings/setup");
  await expect(page.getByText(/of 5 must-do steps done/)).toBeVisible();

  // Calendar feed: create the private link and read it like a calendar app would.
  await page.goto("/settings/calendar");
  await page.getByRole("button", { name: "Create my calendar link" }).click();
  const feed = await page.locator("#feed").inputValue();
  const res = await page.request.get(new URL(feed).pathname);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  expect(await res.text()).toContain("BEGIN:VCALENDAR");
});

