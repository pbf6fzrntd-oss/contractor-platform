export function ComingSoon({ milestone, children }: { milestone: string; children: React.ReactNode }) {
  return (
    <div className="card border-dashed text-center">
      <p className="text-slate-700">{children}</p>
      <p className="mt-2 text-sm text-slate-500">Coming in {milestone}.</p>
    </div>
  );
}
