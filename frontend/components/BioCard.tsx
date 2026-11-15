import type { BioInfo } from "@/lib/types";
import { SourceLink } from "@/components/ui";

/** Who is coming in or going out, with where the background came from. */
export default function BioCard({ bio }: { bio: BioInfo }) {
  return (
    <div className="border border-[#E5E7EB] p-4">
      <p className="text-[17px] font-bold leading-tight">{bio.name}</p>
      {bio.role ? <p className="mt-0.5 text-[14px] text-[#4B5563]">{bio.role}</p> : null}
      {bio.background ? <p className="mt-2 text-[14px] leading-relaxed">{bio.background}</p> : null}
      {bio.source || bio.source_url ? (
        <p className="mt-2 text-[12.5px]">
          <SourceLink href={bio.source_url}>{bio.source ? `Source: ${bio.source}` : "Source"}</SourceLink>
        </p>
      ) : null}
    </div>
  );
}
