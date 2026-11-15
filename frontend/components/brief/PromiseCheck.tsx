import type { PromiseCheck as PromiseCheckType } from "@/lib/types";
import { fmtPctPlain, fmtPeriod } from "@/lib/format";
import { SourceLink } from "@/components/ui";
import StatusChip from "./StatusChip";
import { metricLabel, promiseSentence } from "./model";

function IllustrativeTag() {
  return <span className="chip bg-[#F5F1E8] text-black">Illustrative</span>;
}

function SampleFilingTag() {
  return <span className="chip bg-[#F5F1E8] text-black">Sample filing</span>;
}

/** Compact promise check for the focus card: verdict chip, one sentence, both sources a tap away. */
export function PromiseCheckRow({ pc }: { pc: PromiseCheckType }) {
  if (pc.status === "no_guidance") {
    return (
      <p className="mt-3 border-t border-[#E5E7EB] pt-2.5 text-[13px] leading-snug text-[#4B5563]">
        <span className="label mr-1.5">Promise check</span>
        No numeric guidance on recent calls to check this against.
      </p>
    );
  }
  return (
    <section className="mt-3 border-t border-[#E5E7EB] pt-3" aria-label="Promise check">
      <div className="flex items-center gap-2">
        <h3 className="label">Promise check</h3>
        <StatusChip status={pc.status} />
        {pc.is_illustrative ? <IllustrativeTag /> : pc.is_sample_filing ? <SampleFilingTag /> : null}
      </div>
      <p
        className={`num mt-1.5 leading-snug ${
          pc.status === "kept" || pc.status === "missed" ? "text-[15px] font-semibold text-black" : "text-[14px] text-[#374151]"
        }`}
      >
        {promiseSentence(pc)}
      </p>
      <div className="mt-1 flex flex-wrap gap-x-5 text-[13px]">
        {pc.guided_source?.url ? (
          <SourceLink href={pc.guided_source.url} className="min-h-11">
            {pc.guided_period ? `${fmtPeriod(pc.guided_period)} call` : "Guidance"}
          </SourceLink>
        ) : null}
        {pc.delivered_source?.url ? (
          <SourceLink href={pc.delivered_source.url} className="min-h-11">
            {pc.delivered_period ? `${fmtPeriod(pc.delivered_period)} results` : "Results filing"}
          </SourceLink>
        ) : null}
      </div>
    </section>
  );
}

/** Full promise check for the evidence screen: both sides side by side, the quote, and both sources. */
export function PromiseCheckPanel({ pc }: { pc: PromiseCheckType }) {
  const missed = pc.status === "missed";
  const kept = pc.status === "kept";
  return (
    <section className="card p-4" aria-labelledby="promise-check-title">
      <div className="flex items-center gap-2">
        <h2 id="promise-check-title" className="label">
          Promise check
        </h2>
        <StatusChip status={pc.status} />
        {pc.is_illustrative ? <IllustrativeTag /> : pc.is_sample_filing ? <SampleFilingTag /> : null}
      </div>
      <p className="mt-2 text-[16px] font-semibold leading-snug">{promiseSentence(pc)}</p>

      {pc.status === "no_guidance" ? (
        pc.delivered_source?.url ? (
          <p className="mt-2 border-t border-[#E5E7EB]">
            <SourceLink href={pc.delivered_source.url} className="min-h-11 text-[14px]">
              Open the {fmtPeriod(pc.delivered_period) || "latest"} results filing
            </SourceLink>
          </p>
        ) : null
      ) : (
        <GuidedVsDelivered pc={pc} kept={kept} missed={missed} />
      )}
      {pc.is_illustrative ? (
        <p className="mt-2 text-[12.5px] leading-snug text-[#4B5563]">
          Sample-day numbers. FINN does not grade them as real outcomes.
        </p>
      ) : pc.is_sample_filing && pc.status !== "no_guidance" ? (
        <p className="mt-2 text-[12.5px] leading-snug text-[#4B5563]">
          The filing is a sample-day stand-in. The guided band is quoted from the company&rsquo;s own call and the
          delivered figure is its reported {fmtPeriod(pc.delivered_period) || "latest"} number
          {pc.numbers_source ? ` (${pc.numbers_source})` : ""}.
        </p>
      ) : null}
    </section>
  );
}

function GuidedVsDelivered({ pc, kept, missed }: { pc: PromiseCheckType; kept: boolean; missed: boolean }) {
  return (
    <>
      <dl className="mt-3 grid grid-cols-2 border-t border-[#E5E7EB]">
        <div className="border-r border-[#E5E7EB] py-3 pr-3">
          <dt className="label">Guided</dt>
          <dd className="num mt-1 text-[22px] font-bold leading-tight">{pc.guided_band || "None"}</dd>
          <dd className="text-[12.5px] text-[#4B5563]">
            {pc.guided_period ? `${fmtPeriod(pc.guided_period)} call` : "No call on record"}
          </dd>
        </div>
        <div className="py-3 pl-3">
          <dt className="label">Delivered</dt>
          <dd
            className="num mt-1 text-[22px] font-bold leading-tight"
            style={{ color: missed ? "#B4442C" : kept ? "#1E6B4F" : "#000000" }}
          >
            {fmtPctPlain(pc.delivered)}
          </dd>
          <dd className="text-[12.5px] text-[#4B5563]">{pc.delivered_period ? fmtPeriod(pc.delivered_period) : metricLabel(pc.metric)}</dd>
        </div>
      </dl>

      {pc.guided_source?.excerpt ? (
        <blockquote className="mt-1 bg-[#F5F1E8] px-3 py-2.5 text-[14px] leading-relaxed">
          &ldquo;{pc.guided_source.excerpt.replace(/\s+/g, " ").trim()}&rdquo;
          {pc.guided_source.title ? (
            <footer className="mt-1 text-[12px] text-[#4B5563]">{pc.guided_source.title}</footer>
          ) : null}
        </blockquote>
      ) : null}

      <ul className="mt-2">
        <li className="border-t border-[#E5E7EB]">
          <SourceLink href={pc.guided_source?.url} className="min-h-11 w-full text-[14px]">
            {pc.guided_source?.url
              ? `Read the guidance in the ${fmtPeriod(pc.guided_period) || "earlier"} call`
              : "No transcript link for the guidance"}
          </SourceLink>
        </li>
        <li className="border-t border-[#E5E7EB]">
          <SourceLink href={pc.delivered_source?.url} className="min-h-11 w-full text-[14px]">
            {pc.delivered_source?.url
              ? `Open the ${fmtPeriod(pc.delivered_period) || "latest"} results filing`
              : pc.delivered_source?.title
                ? `Delivered figure from ${pc.delivered_source.title}`
                : "No document attached to the delivered figure"}
          </SourceLink>
        </li>
      </ul>
    </>
  );
}
