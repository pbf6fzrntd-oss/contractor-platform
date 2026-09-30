import { expect, test } from "@playwright/test";

/** Module A: a pest control company signs up and uses agreements and access notes. */
test("a pest control company tracks agreements, renewals and access notes", async ({ page }) => {
  const email = `pest-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.example.com`;
  await page.goto("/signup");
  await page.locator("#full_name").fill("Pat Pest");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("password123");
  await page.locator("button[type=submit]").click();
  await page.waitForURL(/onboarding/);
  await page.locator("#name").fill("Palmetto Pest Pros");
  await page.locator("#industry").selectOption("pest_control");
  await page.locator("#alert_phone").fill("843-555-0190");
  await page.locator("button[type=submit]").click();
  await page.waitForURL(/\/today/);

  // A route customer, due today.
  await page.goto("/customers/new");
  await page.locator("#name").fill("Karen Whitfield");
  await page.locator("#phone").fill("843-555-0191");
  await page.locator("#address").fill("118 Tupelo Ln, Summerville");
  await page.locator("#service_day").selectOption(String(new Date().getDay()));
  await page.locator("input[name=service_texts]").check();
  await page.locator("form button[type=submit]").last().click();
  await page.waitForURL(/\/customers\/[0-9a-f-]{36}/);

  // Private access notes show on the customer page and on Today's route.
  await page.locator("#access_notes").fill("Gate 4821#, dog in back yard");
  await page.getByRole("button", { name: "Save access notes" }).click();
  await expect(page.getByText("Saved.").first()).toBeVisible();
  await page.goto("/today");
  await expect(page.getByText("🔑 Gate 4821#, dog in back yard")).toBeVisible();

  // Agreements: menu, quick pick, renewal reminder preview.
  await page.goto("/agreements");
  await expect(page.getByRole("heading", { name: "Agreements" })).toBeVisible();
  await page.getByRole("link", { name: "+ New" }).click();
  await page.locator("#customer").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Termite bond" }).click();
  await page.locator("#price").fill("$450");
  const soon = new Date(Date.now() - 350 * 86_400_000).toISOString().slice(0, 10);
  await page.locator("#starts_on").fill(soon);
  await page.getByRole("button", { name: "Save agreement" }).click();
  await page.waitForURL(/\/agreements\/[0-9a-f-]{36}/);
  await expect(page.getByText("Renewing soon")).toBeVisible();
  await expect(page.getByText(/Palmetto Pest Pros: Your "Termite bond" renews on/)).toBeVisible();
  await page.getByRole("button", { name: "Text the reminder now" }).click();
  await expect(page.getByText(/Reminder queued/)).toBeVisible();

  // The customer's page lists the agreement.
  await page.goto("/customers");
  await page.getByText("Karen Whitfield").first().click();
  await expect(page.getByRole("heading", { name: "Agreements" })).toBeVisible();
  await expect(page.getByText("Termite bond")).toBeVisible();
});
