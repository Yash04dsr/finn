import type { Alert, AnnouncementPayload, VolumeOrPricePayload } from "@/lib/types";
import { crore, pct } from "@/lib/format";

function tone(v: number | null | undefined): string {
  if (v == null || v === 0) return "#4B5563";
  return v > 0 ? "#1E6B4F" : "#B4442C";
}

/** The numbers that matter, inline, so nobody opens the PDF to find them. YoY leads; the level sits under it. */
export default function KeyNumbers({ item }: { item: Pick<Alert, "kind" | "payload"> }) {
  const p = item.payload as Partial<AnnouncementPayload & VolumeOrPricePayload>;

  if (item.kind === "announcement" && p.facts?.rows?.length) {
    const rows = ["Revenue", "EBITDA", "PAT"].map(
      (label) => p.facts!.rows.find((r) => r.label === label) ?? { label, value: null, yoy_pct: null },
    );
    return (
      <div className="mt-3">
        <dl className="grid grid-cols-3 border-t border-[#E5E7EB]">
          {rows.map((r, i) => (
            <div key={r.label} className={`pt-2 ${i > 0 ? "pl-3" : ""}`}>
              <dt className="text-[12px] font-semibold text-[#4B5563]">{r.label} YoY</dt>
              <dd className="num text-[18px] font-bold leading-tight" style={{ color: tone(r.yoy_pct) }}>
                {r.yoy_pct == null ? <span className="text-[14px] font-semibold text-[#4B5563]">Not reported</span> : pct(r.yoy_pct)}
              </dd>
              <dd className="num text-[12px] text-[#4B5563]">{r.value == null ? "\u00a0" : crore(r.value)}</dd>
            </div>
          ))}
        </dl>
        {p.facts.period ? (
          <p className="num mt-1 text-[12px] text-[#4B5563]">
            {p.facts.period.replace(/^(Q\d)(FY)/, "$1 $2")}
            {p.facts.is_illustrative || p.is_sample ? " · sample-day numbers, not reported figures" : ""}
          </p>
        ) : null}
      </div>
    );
  }

  if (item.kind === "volume_spike" || item.kind === "price_move") {
    const change = p.change_pct ?? (item.kind === "price_move" ? p.value : null) ?? null;
    const cells = [
      { label: "Close", value: p.close != null ? `₹${p.close.toLocaleString("en-IN")}` : "n/a", color: "#000000" },
      { label: "Day", value: change == null ? "n/a" : pct(change), color: tone(change) },
      item.kind === "volume_spike"
        ? { label: "Volume", value: `${(p.value ?? 0).toFixed(1)}x`, color: "#000000" }
        : { label: "Your line", value: `${p.threshold ?? "?"}%`, color: "#000000" },
    ];
    return (
      <div className="mt-3">
        <dl className="grid grid-cols-3 border-t border-[#E5E7EB]">
          {cells.map((c, i) => (
            <div key={c.label} className={`pt-2 ${i > 0 ? "pl-3" : ""}`}>
              <dt className="text-[12px] font-semibold text-[#4B5563]">{c.label}</dt>
              <dd className="num text-[18px] font-bold leading-tight" style={{ color: c.color }}>
                {c.value}
              </dd>
            </div>
          ))}
        </dl>
        {item.kind === "volume_spike" ? (
          <p className="num mt-1 text-[12px] text-[#4B5563]">Your line is {p.threshold ?? "?"}x the 20-day average.</p>
        ) : null}
      </div>
    );
  }
  return null;
}
