/**
 * A small bar chart of one weekly number (e.g. new leads per week). Plain
 * HTML so it needs no chart library: one brand color, rounded bar tops on a
 * baseline, a tooltip on hover/focus and a hidden table for screen readers.
 */
export function WeeklyBars({ title, subtitle, weeks, unit }: { title: string; subtitle?: string; weeks: { start: string; value: number }[]; unit: [string, string] }) {
  const max = Math.max(1, ...weeks.map((w) => w.value));
  const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const words = (n: number) => `${n} ${n === 1 ? unit[0] : unit[1]}`;
  const total = weeks.reduce((s, w) => s + w.value, 0);

  return (
    <section className="card">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {subtitle && <p className="text-sm text-slate-600">{subtitle}</p>}
        </div>
        <p className="shrink-0 text-sm text-slate-500">{words(total)} total</p>
      </div>
      <div className="relative" role="group" aria-label={`${title} chart`}>
        {/* Recessive guide line at the top value */}
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-slate-200" />
        <span className="absolute -top-2.5 right-0 bg-white pl-1 text-[11px] text-slate-500">{max}</span>
        <div className="flex h-40 items-end gap-1.5 border-b border-slate-300 pt-2 sm:gap-2">
          {weeks.map((w, i) => (
            <div key={w.start} className="group relative flex h-full flex-1 items-end" tabIndex={0} role="img" aria-label={`Week of ${label(w.start)}: ${words(w.value)}${i === weeks.length - 1 ? " (so far)" : ""}`}>
              <div
                className={`w-full rounded-t-[4px] ${i === weeks.length - 1 ? "bg-brand-600/55" : "bg-brand-600"} group-hover:bg-brand-800 group-focus:bg-brand-800`}
                style={{ height: `${w.value ? Math.max(3, (w.value / max) * 100) : 0}%` }}
              />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-xs text-white shadow group-hover:block group-focus:block">
                Week of {label(w.start)}: <strong>{words(w.value)}</strong>
                {i === weeks.length - 1 ? " (so far)" : ""}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5 text-[11px] text-slate-500 sm:gap-2">
          {weeks.map((w, i) => (
            <span key={w.start} className="flex-1 text-center">{i % 3 === 0 || i === weeks.length - 1 ? label(w.start) : ""}</span>
          ))}
        </div>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead><tr><th>Week of</th><th>{unit[1]}</th></tr></thead>
        <tbody>{weeks.map((w) => <tr key={w.start}><td>{label(w.start)}</td><td>{w.value}</td></tr>)}</tbody>
      </table>
    </section>
  );
}
