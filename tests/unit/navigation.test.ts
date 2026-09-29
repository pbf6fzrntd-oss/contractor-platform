import { describe, expect, it } from "vitest";
import { buildNavigation, canVisit, homePath } from "@/lib/navigation";
import { CORE, PILOT } from "./plans";

const hrefs = (items: { href: string }[]) => items.map((i) => i.href);

describe("navigation", () => {
  it("shows trades only the core screens", () => {
    const nav = buildNavigation("project", PILOT);
    expect(hrefs(nav.primary)).toEqual(["/inbox", "/dashboard", "/settings"]);
    expect(nav.more).toEqual([]);
  });

  it("gives lawn businesses Today first and puts overflow under More", () => {
    const nav = buildNavigation("recurring", PILOT);
    expect(hrefs(nav.primary)).toEqual(["/today", "/inbox", "/customers", "/dashboard", "/more"]);
    expect(hrefs(nav.more)).toEqual(["/campaigns", "/settings"]);
  });

  it("never shows more than 5 buttons in the bottom bar", () => {
    for (const type of ["project", "recurring"] as const) {
      expect(buildNavigation(type, PILOT).primary.length).toBeLessThanOrEqual(5);
    }
  });

  it("hides lawn features the plan doesn't include", () => {
    const nav = buildNavigation("recurring", CORE);
    expect(hrefs(nav.primary)).toEqual(["/inbox", "/dashboard", "/settings"]);
  });

  it("blocks lawn-only pages for trades, including sub-pages", () => {
    expect(canVisit("/today", "project", PILOT)).toBe(false);
    expect(canVisit("/customers/123", "project", PILOT)).toBe(false);
    expect(canVisit("/today", "recurring", PILOT)).toBe(true);
    expect(canVisit("/inbox", "project", PILOT)).toBe(true);
    expect(canVisit("/settings/team", "project", PILOT)).toBe(true);
  });

  it("lands each business type on its main screen", () => {
    expect(homePath("recurring", PILOT)).toBe("/today");
    expect(homePath("project", PILOT)).toBe("/inbox");
    expect(homePath("recurring", CORE)).toBe("/inbox");
  });
});
