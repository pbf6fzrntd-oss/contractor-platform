import type { BusinessType } from "@/lib/business-types";

/**
 * The owner's "finish setting up" list (pure). Required steps get the
 * business answering missed calls for real; optional ones make it better.
 */
export type SetupState = {
  businessType: BusinessType;
  hasPhone: boolean;
  phoneIsPretend: boolean;
  hasAlertPhone: boolean;
  hasReviewLink: boolean;
  callsReceived: number;
  registrationStatus: string;
  recurringCustomers: number;
  credentials: number;
  teamMembers: number;
  profileAvailable: boolean;
  profileOn: boolean;
  bookingAvailable: boolean;
  bookingOn: boolean;
};

export type SetupStep = { key: string; title: string; detail: string; href: string; done: boolean; optional: boolean };

export function setupSteps(s: SetupState): SetupStep[] {
  const steps: SetupStep[] = [
    {
      key: "number",
      title: "Get your business texting number",
      detail: "Missed calls forward to it, and texts go out from it.",
      href: "/settings/phone",
      done: s.hasPhone,
      optional: false,
    },
    {
      key: "alerts",
      title: "Get new-lead alerts on your cell",
      detail: "We text you the moment a new customer calls or texts.",
      href: "/settings/business",
      done: s.hasAlertPhone,
      optional: false,
    },
    {
      key: "test",
      title: s.phoneIsPretend ? "Try it: miss a call in the simulator" : "Forward unanswered calls, then test it",
      detail: s.phoneIsPretend
        ? "See the automatic text-back a customer gets."
        : "Dial your carrier's forwarding code, call your cell from another phone and let it ring out.",
      href: s.phoneIsPretend ? "/simulator" : "/settings/phone",
      done: s.callsReceived > 0,
      optional: false,
    },
    {
      key: "registration",
      title: "Register for business texting",
      detail: "Phone companies require it before texting customers. Takes about 10 minutes; approval takes a few days.",
      href: "/settings/registration",
      done: ["submitted", "in_review", "approved"].includes(s.registrationStatus),
      optional: false,
    },
    {
      key: "reviews",
      title: "Add your Google review link",
      detail: "Happy customers get asked for a review after each job.",
      href: "/settings/business",
      done: s.hasReviewLink,
      optional: false,
    },
  ];
  if (s.businessType === "recurring") {
    steps.push({ key: "customers", title: "Add your customers", detail: "Import a spreadsheet so rain delays and route texts reach everyone.", href: "/customers/import", done: s.recurringCustomers > 0, optional: false });
  }
  steps.push({ key: "licenses", title: "Add your license and insurance", detail: "Shown on your profile, and we remind you before they expire.", href: "/settings/licenses", done: s.credentials > 0, optional: true });
  if (s.bookingAvailable) steps.push({ key: "booking", title: "Turn on online booking", detail: "Customers (and their AI assistants) can book open times.", href: "/settings/booking", done: s.bookingOn, optional: true });
  if (s.profileAvailable) steps.push({ key: "profile", title: "Turn on your public profile", detail: "A page Google and AI assistants can read, with a Book button.", href: "/settings/profile", done: s.profileOn, optional: true });
  steps.push({ key: "team", title: "Invite your office manager", detail: "They can answer texts and run the day, without your billing or settings.", href: "/settings/team", done: s.teamMembers > 1, optional: true });
  return steps;
}

export function setupProgress(steps: SetupStep[]) {
  const required = steps.filter((s) => !s.optional);
  const done = required.filter((s) => s.done).length;
  return { done, total: required.length, complete: done === required.length, next: steps.find((s) => !s.done) ?? null };
}
