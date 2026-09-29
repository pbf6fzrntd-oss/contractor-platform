/**
 * One headline number. The optional change vs. last period shows an arrow
 * and words, not just color, so it reads for everyone.
 */
export function StatTile({
  label,
  value,
  detail,
  delta,
  hero = false,
}: {
  label: string;
  value: string;
  detail?: string;
  delta?: { change: number; goodWhenUp: boolean; period: string };
  hero?: boolean;
}) {
  let deltaEl: React.ReactNode = null;
  if (delta) {
    const up = delta.change > 0;
    const flat = delta.change === 0;
    const good = flat ? null : up === delta.goodWhenUp;
    const tone = good === null ? "text-slate-500" : good ? "text-emerald-700" : "text-red-700";
    deltaEl = (
      <p className={`mt-1 text-sm font-medium ${tone}`}>
        {flat ? "Same as" : `${up ? "▲" : "▼"} ${Math.abs(delta.change)} ${up ? "more than" : "fewer than"}`} {delta.period}
      </p>
    );
  }
  return (
    <div className="card">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className={`${hero ? "text-5xl" : "text-3xl"} mt-1 font-semibold tracking-tight text-slate-900`}>{value}</p>
      {deltaEl}
      {detail && <p className="mt-1 text-sm text-slate-500">{detail}</p>}
    </div>
  );
}
