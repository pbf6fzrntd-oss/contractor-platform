import { expect, test } from "@playwright/test";
import { expectNoSideways, openTryIt, startDemo } from "./helpers";

test.describe("Try it live (a trade)", () => {
  test("a missed call gets a text back, and the owner can work the lead", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Try the live demo/ })).toBeVisible();
    await startDemo(page, "Roofing");
    await expectNoSideways(page);

    // The prospect plays a customer who calls while the roofer is busy.
    await openTryIt(page);
    await page.getByRole("button", { name: /Miss a call from a new customer/ }).click();
    await page.waitForURL(/tried=missed_call/);
    await expect(page.getByText("What just happened")).toBeVisible();
    await expect(page.getByText(/Sorry we missed your call! This is Palmetto Roofing/)).toBeVisible();
    await expect(page.getByText("Missed call ·", { exact: false }).first()).toBeVisible();

    // Reply by hand.
    await page.locator("textarea[name=body]").fill("Hi! We can come look tomorrow at 10.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText("Hi! We can come look tomorrow at 10.").last()).toBeVisible();

    // Quote sent → automatic follow-ups line up.
    await page.getByText("Estimate sent", { exact: true }).last().click();
    await page.locator("#estimate_amount").fill("$4,500");
    await page.getByRole("button", { name: "Save stage" }).click();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Automatic texts" })).toBeVisible();
  });

  test("the dashboard shows the money and the weekly chart", async ({ page }) => {
    await startDemo(page, "Heating & air");
    await page.goto("/dashboard");
    await expect(page.getByText("Won, last 30 days")).toBeVisible();
    await expect(page.getByText("Saved from missed calls, last 30 days")).toBeVisible();
    await expect(page.getByRole("heading", { name: "New leads per week" })).toBeVisible();
    await expectNoSideways(page);
  });

  test("customers can book online, and the owner sees the request", async ({ page, context }) => {
    await startDemo(page, "Plumbing");
    await openTryIt(page);
    const [booking] = await Promise.all([context.waitForEvent("page"), page.getByRole("link", { name: /Book online as a customer/ }).click()]);
    await booking.waitForLoadState();
    await booking.locator("#service").selectOption({ index: 1 });
    await booking.getByRole("button", { name: "See available times" }).click();
    await booking.locator("fieldset label").first().click();
    await booking.locator("#name").fill("Pat Tester");
    await booking.locator("#phone").fill("843-555-0142");
    await booking.locator("input[name=consent]").check();
    await booking.getByRole("button", { name: "Request booking" }).click();
    await booking.waitForURL(/book\/done/);
    await expect(booking.getByRole("heading", { name: /Request sent|You're booked/ })).toBeVisible();

    await page.goto("/schedule");
    await expect(page.getByText("Pat Tester").first()).toBeVisible();
  });

  test("Spanish customers are answered in Spanish", async ({ page }) => {
    await startDemo(page, "Electrical");
    await openTryIt(page);
    await page.getByRole("button", { name: /in Spanish/ }).click();
    await page.waitForURL(/tried=text/);
    // The conversation itself (on laptops the list beside it also shows the text).
    await expect(page.locator("ol li", { hasText: /Se fue la luz|cargador/ }).first()).toBeVisible();
  });
});
