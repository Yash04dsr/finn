import type { FactsTable as FactsTableType } from "@/lib/types";
import { pct } from "@/lib/format";

/** Results facts table with color-coded QoQ / YoY deltas. */
export default function FactsTable({ facts }: { facts: FactsTableType }) {
  const rows = facts?.rows ?? [];
  if (!rows.length) return null;

  return (
    <div className="overflow-hidden rounded-none border border-[#000000]/[0.12]">
      <table className="num w-full text-[12.5px]">
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
              <td className="px-2 py-2 text-right font-semibold text-[#000000]">{r.value}</td>
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
  if (v == null || Number.isNaN(v)) return "#4B5563";
  return v > 0 ? "#1E6B4F" : "#B4442C";
}
