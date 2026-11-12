import type { BioInfo } from "@/lib/types";

/** "New CFO" style bio card inside announcement details. */
export default function BioCard({ bio }: { bio: BioInfo }) {
  return (
    <div className="rounded-xl border border-[#1F1B16]/[0.12] bg-[#1F1B16]/[0.03] p-3.5">
      <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-[#6E675C]">Leadership change</p>
      <p className="text-[15px] font-semibold text-[#1F1B16]">{bio.name}</p>
      {bio.most_recent_role && <p className="mt-0.5 text-[12.5px] text-[#1E6B4F]">{bio.most_recent_role}</p>}
      {bio.background && <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#6E675C]">{bio.background}</p>}
    </div>
  );
}
