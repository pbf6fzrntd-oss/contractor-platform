import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expectNoSideways, startDemo } from "./helpers";

// A release gate for the working product, not the separate read-only preview.
test("dashboard and primary pages support keyboard and accessible phone navigation", async ({ page }, testInfo) => {
  await startDemo(page, "Heating & air");
  for (const path of ["/dashboard", "/inbox", "/more", "/settings"]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expectNoSideways(page);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await skip.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    await testInfo.attach(`accessibility-${path.slice(1)}`, { body: JSON.stringify(results.violations, null, 2), contentType: "application/json" });
    expect(results.violations).toEqual([]);
    if (path === "/dashboard") await page.screenshot({ path: `test-results/dashboard-${testInfo.project.name}.png`, fullPage: true });
  }
  const navigation = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
  for (const link of await navigation.getByRole("link").all()) {
    const box = await link.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(48);
  }
});
