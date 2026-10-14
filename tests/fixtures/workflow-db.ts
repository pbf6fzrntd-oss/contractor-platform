import { randomUUID } from "node:crypto";
import type { AdminClient } from "@/lib/supabase/admin";

type Row = Record<string, unknown>;
type Failure = { table: string; operation: string; error: Error };

/** A synthetic, in-memory service fixture, NOT a substitute for database/RLS tests.
 * Only the query/RPC operations exercised by these scenarios are implemented.
 * No credentials, sockets, real contacts, or provider requests are used. */
export function workflowDb(seed: Record<string, Row[]> = {}) {
  const rows = new Map(Object.entries(structuredClone(seed)));
  const failures: Failure[] = [];
  const tableRows = (table: string) => {
    if (!rows.has(table)) rows.set(table, []);
    return rows.get(table)!;
  };
  function insert(table: string, value: Row) {
    const row: Row = { id: randomUUID(), created_at: new Date().toISOString(), ...value };
    if (table === "job_runs") Object.assign(row, { ran_at: new Date().toISOString(), result: null, ...value });
    if (table === "contacts") Object.assign(row, { opted_out_at: null, marketing_consent_at: null, do_not_autotext: false, review_requested_at: null, ...value });
    if (table === "leads") Object.assign(row, { stage: "new", estimate_sent_at: null, first_response_at: null, ...value });
    if (table === "scheduled_messages") Object.assign(row, { status: "pending", attempts: 0, lead_id: null, broadcast_id: null, template_key: null, ...value });
    if (table === "bookings") Object.assign(row, { verify_by: null, customer_verified_at: null, ...value });
    tableRows(table).push(row);
    return row;
  }
  function from(table: string) {
    let operation = "select", values: Row[] = [], single = false, throwErrors = false, max = Infinity;
    let conflict = "id", ignoreDuplicates = false;
    const filters: ((row: Row) => boolean)[] = [];
    const sorts: { column: string; ascending: boolean }[] = [];
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => { filters.push(row => row[column] === value); return query; },
      neq: (column: string, value: unknown) => { filters.push(row => row[column] !== value); return query; },
      in: (column: string, values: unknown[]) => { filters.push(row => values.includes(row[column])); return query; },
      is: (column: string, value: unknown) => { filters.push(row => (row[column] ?? null) === value); return query; },
      not: (column: string, _operator: string, value: unknown) => { filters.push(row => (row[column] ?? null) !== value); return query; },
      gt: (column: string, value: unknown) => { filters.push(row => String(row[column]) > String(value)); return query; },
      gte: (column: string, value: unknown) => { filters.push(row => String(row[column]) >= String(value)); return query; },
      lt: (column: string, value: unknown) => { filters.push(row => String(row[column]) < String(value)); return query; },
      lte: (column: string, value: unknown) => { filters.push(row => String(row[column]) <= String(value)); return query; },
      // This fixture has only timed bookings, all in the selected range.
      or: () => query,
      order: (column: string, options?: { ascending: boolean }) => { sorts.push({ column, ascending: options?.ascending ?? true }); return query; },
      limit: (limit: number) => { max = limit; return query; },
      single: () => { single = true; return query; },
      maybeSingle: () => { single = true; return query; },
      throwOnError: () => { throwErrors = true; return query; },
      insert: (value: Row | Row[]) => { operation = "insert"; values = Array.isArray(value) ? value : [value]; return query; },
      upsert: (value: Row, options?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
        operation = "upsert"; values = [value]; conflict = options?.onConflict ?? "id"; ignoreDuplicates = options?.ignoreDuplicates ?? false; return query;
      },
      update: (value: Row) => { operation = "update"; values = [value]; return query; },
      delete: () => { operation = "delete"; return query; },
      then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) => {
        const result = Promise.resolve().then(() => {
          const index = failures.findIndex(failure => failure.table === table && failure.operation === operation);
          if (index >= 0) {
            const [{ error }] = failures.splice(index, 1);
            if (throwErrors) throw error;
            return { data: null, error, count: null };
          }
          let selected = tableRows(table).filter(row => filters.every(filter => filter(row)));
          if (operation === "insert") selected = values.map(value => insert(table, value));
          if (operation === "upsert") selected = values.flatMap(value => {
            const existing = tableRows(table).find(row => conflict.split(",").every(column => row[column] === value[column]));
            if (existing && ignoreDuplicates) return [];
            if (existing) { Object.assign(existing, value); return [existing]; }
            return [insert(table, value)];
          });
          if (operation === "update") for (const row of selected) {
            Object.assign(row, values[0]);
            if (table === "leads" && values[0].stage === "estimate_sent") row.estimate_sent_at = new Date().toISOString();
          }
          if (operation === "delete") rows.set(table, tableRows(table).filter(row => !selected.includes(row)));
          selected.sort((a, b) => {
            for (const sort of sorts) {
              const order = String(a[sort.column]).localeCompare(String(b[sort.column]));
              if (order) return sort.ascending ? order : -order;
            }
            return 0;
          });
          selected = selected.slice(0, max);
          return { data: structuredClone(single ? selected[0] ?? null : selected), error: null, count: selected.length };
        });
        return result.then(resolve, reject);
      },
    };
    return query;
  }
  async function rpc(name: string, args: Row) {
    if (name === "claim_scheduled_messages") {
      const claimed = tableRows("scheduled_messages").filter(row => row.status === "pending"
        && (!args.p_org_id || row.org_id === args.p_org_id)
        && (!args.p_ids || (args.p_ids as string[]).includes(String(row.id)))
        && (args.p_fast_forward || String(row.send_at) <= String(args.p_now))).slice(0, Number(args.p_limit));
      for (const row of claimed) { row.status = "processing"; row.attempts = Number(row.attempts) + 1; }
      return { data: structuredClone(claimed), error: null };
    }
    if (name === "reserve_sms_attempt") {
      const message = insert("messages", { ...(args.p_message as Row), status: "queued" });
      insert("sms_attempts", { org_id: message.org_id, request_key: args.p_key, fingerprint: args.p_fingerprint, message_id: message.id, state: "submitting" });
      return { data: { fresh: true, message_id: message.id, usage: tableRows("sms_attempts").length }, error: null };
    }
    if (name === "finish_sms_attempt") {
      const attempt = tableRows("sms_attempts").find(row => row.org_id === args.p_org_id && row.request_key === args.p_key)!;
      attempt.state = args.p_state;
      Object.assign(tableRows("messages").find(row => row.id === attempt.message_id)!, { status: args.p_status, provider_sid: args.p_sid, error: args.p_error });
      return { data: true, error: null };
    }
    if (name === "record_consent_event") {
      insert("consent_events", args);
      if (args.p_kind === "opt_out") tableRows("contacts").find(row => row.id === args.p_contact_id)!.opted_out_at = new Date().toISOString();
      return { data: true, error: null };
    }
    if (name === "book_slot") {
      const booking = insert("bookings", args.p_booking as Row);
      if (booking.status === "pending_approval") insert("approval_requests", { booking_id: booking.id, org_id: booking.org_id, status: "pending" });
      return { data: booking.id, error: null };
    }
    throw new Error(`Unimplemented fixture RPC: ${name}`);
  }
  return {
    db: { from, rpc } as unknown as AdminClient,
    rows: tableRows,
    insert,
    failNext: (table: string, operation = "select") => failures.push({ table, operation, error: new Error("Synthetic database outage") }),
  };
}
