import type { BioInfo } from "@/lib/types";

/** "New CFO" style bio card inside announcement details. */
export default function BioCard({ bio }: { bio: BioInfo }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
      <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-[#8B93A3]">Leadership change</p>
      <p className="text-[15px] font-semibold text-[#E8ECF3]">{bio.name}</p>
      {bio.most_recent_role && <p className="mt-0.5 text-[12.5px] text-[#10B981]">{bio.most_recent_role}</p>}
      {bio.background && <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#8B93A3]">{bio.background}</p>}
    </div>
  );
}
