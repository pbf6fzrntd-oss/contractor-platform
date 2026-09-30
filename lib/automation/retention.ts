/**
 * How long short-lived records are kept before the daily cleanup deletes them.
 * Customer conversations, consent history, jobs and bookings are NEVER deleted
 * here: they're the business's records (and consent must be kept).
 */
export type RetentionRule = {
  table: "public_request_log" | "oauth_codes" | "invitations" | "notifications" | "agent_activity" | "job_runs";
  /** Column compared with the cutoff. */
  column: "created_at" | "expires_at" | "ran_at";
  days: number;
  why: string;
};

export const RETENTION: readonly RetentionRule[] = [
  { table: "public_request_log", column: "created_at", days: 2, why: "Rate limits only look back 24 hours" },
  { table: "oauth_codes", column: "expires_at", days: 1, why: "One-time sign-in codes for AI apps expire in minutes" },
  { table: "invitations", column: "expires_at", days: 30, why: "Invite links expire after 7 days" },
  { table: "job_runs", column: "ran_at", days: 90, why: "Only needed to run daily jobs once a day" },
  { table: "notifications", column: "created_at", days: 180, why: "Old in-app notices" },
  { table: "agent_activity", column: "created_at", days: 365, why: "The AI assistant activity log shows the last year" },
];

/** The moment before which rows are deleted. */
export function retentionCutoff(rule: Pick<RetentionRule, "days">, now: Date): string {
  return new Date(now.getTime() - rule.days * 86_400_000).toISOString();
}
