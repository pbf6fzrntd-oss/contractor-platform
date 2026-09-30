"use client";

export function PrintButton() {
  return (
    <button type="button" className="btn-secondary px-4 print:hidden" onClick={() => window.print()}>
      Print / save as PDF
    </button>
  );
}
