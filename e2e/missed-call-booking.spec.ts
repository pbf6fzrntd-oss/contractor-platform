import { expect, test } from "@playwright/test";
import { openTryIt, startDemo } from "./helpers";

/** Only fictional visitor businesses and simulator numbers. This never calls Twilio. */
test("one customer goes from missed call through follow-ups to an approved online booking", async ({ page, context }) => {
  await startDemo(page, "Roofing");
  await openTryIt(page);
  const bookingPath = await page.getByRole("link", { name: /Book online as a customer/ }).getAttribute("href");
  expect(bookingPath).toBeTruthy();
  const phone = "8435550142";
  await page.goto(`/simulator?from=${phone}`);
  await page.getByRole("button", { name: /Call and nobody answers/ }).click();
  await expect(page.getByText("Missed call logged and the caller was texted.")).toBeVisible();
  await expect(page.getByText(/Sorry we missed your call/).last()).toBeVisible();
  await page.getByRole("link", { name: /New lead \(missed call\).*555-0142/ }).click();
  const leadPath = new URL(page.url()).pathname;

  await page.locator("textarea[name=body]").fill("Your roof inspection estimate is $4,500.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Your roof inspection estimate is $4,500.").last()).toBeVisible();
  await page.getByText("Estimate sent", { exact: true }).last().click();
  await page.locator("#estimate_amount").fill("$4,500");
  await page.getByRole("button", { name: "Save stage" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Automatic texts" })).toBeVisible();
  await page.goto(`/simulator?from=${phone}`);
  await page.getByRole("button", { name: /Skip ahead/ }).click();
  await expect(page.getByText(/Sent [1-9]\d*, skipped/)).toBeVisible();
  await expect(page.getByText(/Just checking that you got our estimate/)).toHaveCount(1);
  await page.getByRole("button", { name: /Skip ahead/ }).click();
  await expect(page.getByText("Sent 0, skipped 0.")).toBeVisible();
  await expect(page.getByText(/Just checking that you got our estimate/)).toHaveCount(1);

  // The public request must reuse this exact caller and lead, not create a separate story.
  const customer = await context.newPage();
  await customer.goto(bookingPath!);
  await customer.locator("#service").selectOption({ index: 1 });
  await customer.getByRole("button", { name: "See available times" }).click();
  await customer.locator("fieldset label").first().click();
  await customer.locator("#name").fill("Workflow Fixture Customer");
  await customer.locator("#phone").fill(phone);
  await customer.locator("input[name=consent]").check();
  await customer.getByRole("button", { name: "Request booking" }).click();
  await customer.waitForURL(/book\/done/);
  await expect(customer.getByRole("heading", { name: "Request sent" })).toBeVisible();

  await page.goto("/schedule");
  const booking = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Workflow Fixture Customer", exact: true }) });
  await expect(booking).toHaveCount(1);
  await expect(booking.getByRole("link", { name: "Workflow Fixture Customer" })).toHaveAttribute("href", leadPath);
  await booking.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(booking.getByText("Confirmed", { exact: true })).toBeVisible();
  await page.goto(`/simulator?from=${phone}`);
  await expect(page.getByText(/You're booked/).last()).toBeVisible();
});
