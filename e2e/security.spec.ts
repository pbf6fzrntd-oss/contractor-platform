import { expect, test } from "@playwright/test";

test.describe("logged-out visitors", () => {
  test("can't see the app", async ({ page }) => {
    for (const path of ["/inbox", "/dashboard", "/settings", "/admin"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test("can't use a made-up or changed booking link", async ({ request }) => {
    expect((await request.get("/m/00000000000000000000000000000000AAAAAAAAAAAAAAAAAAAAAA")).status()).toBe(404);
    expect((await request.get("/m/not-a-real-link")).status()).toBe(404);
  });

  test("can't guess a calendar feed", async ({ request }) => {
    expect((await request.get("/api/calendar/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).status()).toBe(404);
    expect((await request.get("/api/calendar/short")).status()).toBe(404);
  });

  test("the scheduler needs its secret", async ({ request }) => {
    expect((await request.get("/api/cron/dispatch")).status()).toBe(401);
  });
});
