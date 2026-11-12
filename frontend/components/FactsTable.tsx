import type { FactsTable as FactsTableType } from "@/lib/types";
import { crore, pct } from "@/lib/format";

/** Results facts table with color-coded QoQ / YoY deltas. */
export default function FactsTable({ facts }: { facts: FactsTableType }) {
  const rows = facts?.rows ?? [];
  if (!rows.length) return null;

  return (
    <div>
      {facts.is_illustrative && (
        <p className="mb-2 border border-[#B38B6D] bg-[#F5F1E8] px-2.5 py-2 text-[11px] leading-relaxed text-[#000000]">
          Illustrative fallback values — use the linked filing for investment decisions.
        </p>
      )}
      <div className="overflow-x-auto rounded-none border border-[#000000]/[0.12]">
        <table className="num w-full text-[12.5px]">
        {facts.period && <caption className="sr-only">Results first-cut for {facts.period}</caption>}
        <thead>
          <tr className="bg-[#000000]/[0.04] text-left text-[10.5px] uppercase tracking-wider text-[#4B5563]">
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
              <td className="whitespace-nowrap px-2 py-2 text-right font-semibold text-[#000000]">{crore(r.value)}</td>
              <td className="whitespace-nowrap px-2 py-2 text-right" style={{ color: deltaColor(r.qoq_pct) }}>
                {r.qoq_pct == null ? "—" : pct(r.qoq_pct)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right" style={{ color: deltaColor(r.yoy_pct) }}>
                {r.yoy_pct == null ? "—" : pct(r.yoy_pct)}
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
