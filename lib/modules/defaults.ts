/** Every business has Home Services, even if its org_modules rows are missing. */
export function modulesOrDefault(rows: { module: string }[] | null | undefined): string[] {
  const list = (rows ?? []).map((r) => r.module);
  return list.length ? list : ["home_services"];
}
