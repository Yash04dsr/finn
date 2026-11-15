import type { FactsTable as FactsTableType } from "@/lib/types";
import { crore, pct } from "@/lib/format";

/** Results facts table with color-coded QoQ / YoY deltas. */
export default function FactsTable({ facts }: { facts: FactsTableType }) {
  const rows = facts?.rows ?? [];
  if (!rows.length) return null;

  return (
    <div>
      {facts.is_illustrative && (
        <p className="mb-2 bg-[#F5F1E8] px-3 py-2 text-[12.5px] leading-snug text-black">
          Illustrative numbers for the demo, not reported figures.
        </p>
      )}
      <div className="overflow-x-auto border border-[#E5E7EB]">
        <table className="num w-full text-[14px]">
        {facts.period && <caption className="sr-only">Results first-cut for {facts.period}</caption>}
        <thead>
          <tr className="border-b border-black text-left text-[11px] uppercase tracking-[0.08em] text-[#4B5563]">
            <th className="px-3 py-2 font-semibold">Metric</th>
            <th className="px-2 py-2 text-right font-semibold">Value</th>
            <th className="px-2 py-2 text-right font-semibold">QoQ</th>
            <th className="px-3 py-2 text-right font-semibold">YoY</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.label + i} className="border-t border-[#000000]/[0.08]">
              <td className="px-3 py-2 font-medium text-[#000000]">{r.label}</td>
              <td className="whitespace-nowrap px-2 py-2 text-right font-semibold text-[#000000]">
                {r.value == null ? <span className="font-normal text-[#4B5563]">not reported</span> : crore(r.value)}
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-right" style={{ color: deltaColor(r.qoq_pct) }}>
                {r.qoq_pct == null ? "n/a" : pct(r.qoq_pct)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right" style={{ color: deltaColor(r.yoy_pct) }}>
                {r.yoy_pct == null ? "n/a" : pct(r.yoy_pct)}
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </div>
  );
}

function deltaColor(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "#4B5563";
  if (v === 0) return "#4B5563";
  return v > 0 ? "#1E6B4F" : "#B4442C";
}
