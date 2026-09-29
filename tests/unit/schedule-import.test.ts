import { describe, expect, it } from "vitest";
import {
  effectiveStatus,
  firstServiceDate,
  isScheduledOn,
  nextServiceDate,
  parseFrequency,
  parseServiceDay,
  type ServiceSchedule,
} from "@/lib/automation/schedule";
import { parseCsv, parseCustomerCsv } from "@/lib/import/customers-csv";

// Sep 29, 2026 is a Tuesday.
const tuesdayWeekly: ServiceSchedule = {
  id: "s1",
  frequency: "weekly",
  service_day: 2,
  start_date: "2026-09-01",
  status: "active",
  paused_until: null,
};

describe("recurring schedules", () => {
  it("puts weekly customers on every service day from their start", () => {
    expect(isScheduledOn(tuesdayWeekly, "2026-09-29")).toBe(true);
    expect(isScheduledOn(tuesdayWeekly, "2026-09-30")).toBe(false);
    expect(isScheduledOn(tuesdayWeekly, "2026-08-25")).toBe(false); // before start
  });

  it("puts biweekly customers on alternating weeks based on their first service", () => {
    const biweekly = { ...tuesdayWeekly, frequency: "biweekly" };
    expect(firstServiceDate(biweekly)).toBe("2026-09-01");
    expect(isScheduledOn(biweekly, "2026-09-15")).toBe(true);
    expect(isScheduledOn(biweekly, "2026-09-22")).toBe(false);
    expect(isScheduledOn(biweekly, "2026-09-29")).toBe(true);
  });

  it("starts on the first matching weekday after the start date", () => {
    const s = { ...tuesdayWeekly, start_date: "2026-09-03", frequency: "biweekly" }; // a Thursday
    expect(firstServiceDate(s)).toBe("2026-09-08");
    expect(isScheduledOn(s, "2026-09-22")).toBe(true);
  });

  it("handles every-4-weeks customers", () => {
    const s = { ...tuesdayWeekly, frequency: "every_4_weeks" };
    expect(isScheduledOn(s, "2026-09-29")).toBe(true);
    expect(isScheduledOn(s, "2026-10-06")).toBe(false);
    expect(isScheduledOn(s, "2026-10-27")).toBe(true);
  });

  it("leaves out paused and canceled customers, and brings paused ones back on their resume date", () => {
    expect(isScheduledOn({ ...tuesdayWeekly, status: "canceled" }, "2026-09-29")).toBe(false);
    expect(isScheduledOn({ ...tuesdayWeekly, status: "paused" }, "2026-09-29")).toBe(false);
    const pausedUntilOct6 = { ...tuesdayWeekly, status: "paused", paused_until: "2026-10-06" };
    expect(isScheduledOn(pausedUntilOct6, "2026-09-29")).toBe(false);
    expect(isScheduledOn(pausedUntilOct6, "2026-10-06")).toBe(true);
    expect(effectiveStatus(pausedUntilOct6, "2026-10-07")).toBe("active");
  });

  it("follows rain-delay moves", () => {
    const moves = [{ recurring_service_id: "s1", from_date: "2026-09-29", to_date: "2026-10-01" }];
    expect(isScheduledOn(tuesdayWeekly, "2026-09-29", moves)).toBe(false);
    expect(isScheduledOn(tuesdayWeekly, "2026-10-01", moves)).toBe(true);
    expect(isScheduledOn({ ...tuesdayWeekly, id: "other" }, "2026-09-29", moves)).toBe(true);
    expect(nextServiceDate(tuesdayWeekly, "2026-09-29", moves)).toBe("2026-10-01");
  });
});

describe("reading days and frequencies people type", () => {
  it.each([["Tue", 2], ["tuesday", 2], ["Martes", 2], ["Miércoles", 3], ["SAT", 6], ["thurs", 4]])("%s -> %i", (input, day) => {
    expect(parseServiceDay(input)).toBe(day);
  });
  it("rejects nonsense days", () => expect(parseServiceDay("someday")).toBeNull());
  it.each([
    ["Weekly", "weekly"],
    ["every other week", "biweekly"],
    ["Bi-weekly", "biweekly"],
    ["Every 2 weeks", "biweekly"],
    ["monthly", "every_4_weeks"],
    ["quincenal", "biweekly"],
  ])("%s -> %s", (input, freq) => expect(parseFrequency(input)).toBe(freq));
});

describe("CSV import", () => {
  it("reads quoted cells with commas and escaped quotes", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });

  const csv = [
    "Customer Name,Phone,Address,Service,Frequency,Mow Day,Price,Language",
    'Mike Smith,(843) 555-1234,"12 Oak St, Summerville",Mowing,Weekly,Tue,$45,',
    "María López,843.555.2345,,Full service,every other week,jueves,60,Spanish",
    "Bad Phone,555-1234,,Mowing,weekly,Mon,40,",
    "No Day,8435553456,,Mowing,weekly,someday,40,",
    "Dup,(843) 555-1234,,Mowing,weekly,Wed,40,",
  ].join("\n");

  it("imports good rows and explains the bad ones by spreadsheet row", () => {
    const r = parseCustomerCsv(csv, { language: "en", serviceType: "Mowing" });
    expect(r.customers).toHaveLength(2);
    expect(r.customers[0]).toMatchObject({
      name: "Mike Smith",
      phone: "+18435551234",
      address: "12 Oak St, Summerville",
      frequency: "weekly",
      service_day: 2,
      price_cents: 4500,
      language: "en",
    });
    expect(r.customers[1]).toMatchObject({ frequency: "biweekly", service_day: 4, language: "es", price_cents: 6000 });
    expect(r.errors.map((e) => e.line)).toEqual([4, 5, 6]);
    expect(r.errors[2].message).toMatch(/Same phone/);
  });

  it("says which required columns are missing", () => {
    const r = parseCustomerCsv("Name,Address\nMike,12 Oak", { language: "en", serviceType: "Mowing" });
    expect(r.missingColumns).toEqual(["phone", "service_day"]);
  });

  it("defaults frequency to weekly and service to the business default", () => {
    const r = parseCustomerCsv("phone,day\n8435551111,Fri", { language: "es", serviceType: "Mowing" });
    expect(r.customers[0]).toMatchObject({ frequency: "weekly", service_type: "Mowing", language: "es", service_day: 5 });
  });
});
