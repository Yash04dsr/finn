import type { LedgerStatus, PromiseCheck } from "@/lib/types";

type AnyStatus = LedgerStatus | PromiseCheck["status"];

/** Green and oxblood only for Kept and Missed; everything else stays ink and paper. Always labelled. */
const STATUS: Record<AnyStatus, { label: string; className: string }> = {
  kept: { label: "Kept", className: "bg-white text-[#1E6B4F] border-[#1E6B4F]" },
  missed: { label: "Missed", className: "bg-white text-[#B4442C] border-[#B4442C]" },
  revised: { label: "Revised", className: "bg-white text-black border-black" },
  gone_quiet: { label: "Gone quiet", className: "bg-black text-white border-black" },
  too_early: { label: "Too early", className: "bg-white text-[#4B5563] border-[#9CA3AF]" },
  not_checkable: { label: "Tracked", className: "bg-white text-[#4B5563] border-[#9CA3AF]" },
  no_guidance: { label: "No guidance", className: "bg-white text-[#4B5563] border-[#9CA3AF]" },
  not_reported: { label: "Not reported", className: "bg-white text-[#4B5563] border-[#9CA3AF]" },
};

export default function StatusChip({ status }: { status: AnyStatus }) {
  const s = STATUS[status] ?? STATUS.not_checkable;
  return <span className={`chip border ${s.className}`}>{s.label}</span>;
}
