/** Keyset pagination: a report is complete or fails, never a truncated success. */
export async function loadAllReportRows<T extends { id: string }>(
  page: (cursor: string | null, size: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null = null;
  const size = 500; // Below the default PostgREST response cap.
  for (;;) {
    const result = await page(cursor, size);
    if (result.error || !result.data) throw new Error("Dashboard records are unavailable. Try again.");
    if (!result.data.length) return rows;
    // Invalid/non-progressing pages must not become plausible totals or loop forever.
    for (const row of result.data) {
      if (!row.id || (cursor !== null && row.id <= cursor)) throw new Error("Dashboard records are incomplete. Try again.");
      cursor = row.id;
      rows.push(row);
    }
    // Even a short page is followed: the server may impose a smaller cap.
  }
}
