/** Yes / No / Not sure buttons for one audit check. */
export function AnswerPicker({ name, label, current = "unknown" }: { name: string; label: string; current?: string }) {
  const options = [
    ["pass", "Yes"],
    ["fail", "No"],
    ["unknown", "Not sure"],
  ] as const;
  return (
    <div role="radiogroup" aria-label={label}>
      <p className="mb-1 text-sm font-medium">{label}</p>
      <div className="flex gap-2">
        {options.map(([value, text]) => (
          <label key={value} className="flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-white text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:checked]:font-semibold">
            <input type="radio" name={name} value={value} defaultChecked={current === value} className="sr-only" />
            {text}
          </label>
        ))}
      </div>
    </div>
  );
}
