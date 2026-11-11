import type { FactsTable as FactsTableType } from "@/lib/types";
import { pct } from "@/lib/format";

/** Results facts table with color-coded QoQ / YoY deltas. */
export default function FactsTable({ facts }: { facts: FactsTableType }) {
  const rows = facts?.rows ?? [];
  if (!rows.length) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07]">
      <table className="num w-full text-[12.5px]">
        <thead>
          <tr className="bg-white/[0.03] text-left text-[10.5px] uppercase tracking-wider text-[#8B93A3]">
            <th className="px-3 py-2 font-semibold">Metric</th>
            <th className="px-2 py-2 text-right font-semibold">Value</th>
            <th className="px-2 py-2 text-right font-semibold">QoQ</th>
            <th className="px-3 py-2 text-right font-semibold">YoY</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.label + i} className="border-t border-white/[0.05]">
              <td className="px-3 py-2 font-medium text-[#C6CDD9]">{r.label}</td>
              <td className="px-2 py-2 text-right font-semibold text-[#E8ECF3]">{r.value}</td>
              <td className="px-2 py-2 text-right" style={{ color: deltaColor(r.qoq) }}>
                {r.qoq == null ? "—" : pct(r.qoq)}
              </td>
              <td className="px-3 py-2 text-right" style={{ color: deltaColor(r.yoy) }}>
                {r.yoy == null ? "—" : pct(r.yoy)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function deltaColor(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "#8B93A3";
  return v > 0 ? "#10B981" : "#F43F5E";
}
