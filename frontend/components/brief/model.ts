import type { Alert, AnnouncementPayload, Brief, PromiseCheck, Verdict, VolumeOrPricePayload } from "@/lib/types";
import { fmtPctPlain, fmtPeriod } from "@/lib/format";

export const VERDICT_LABEL: Record<Verdict, string> = {
  no_impact: "No impact",
  watch: "Watch closer",
  changes_story: "Changes the story",
};

/** Exchange headlines start with the company name; the ticker badge already says that. */
export function cleanHeadline(raw: string): string {
  const m = raw.match(/^(.{3,70}?)\s+[-–]\s*(.{12,})$/);
  const text = m ? m[2] : raw;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** One-line headline in plain words, whatever kind of alert it is. */
export function headlineOf(item: Pick<Alert, "kind" | "payload">): string {
  const p = item.payload as Partial<AnnouncementPayload & VolumeOrPricePayload>;
  if (item.kind === "announcement") return cleanHeadline(p.headline ?? "Filing");
  if (item.kind === "volume_spike") return `Volume ${(p.value ?? 0).toFixed(1)}x the 20-day average`;
  if (item.kind === "price_move") {
    const v = p.change_pct ?? p.value ?? 0;
    return `Price ${v > 0 ? "up" : "down"} ${Math.abs(v).toFixed(1)}% in a day`;
  }
  return "Alert";
}

export function categoryOf(item: Pick<Alert, "kind" | "payload">): string {
  if (item.kind === "announcement") return (item.payload as Partial<AnnouncementPayload>).category ?? "unclassified";
  return item.kind;
}

/** "ebitda_margin" / "EBITDA margin" → "EBITDA margin" */
export function metricLabel(metric: string): string {
  const s = metric.replace(/_/g, " ").trim();
  const words = s.split(/\s+/).map((w) => (/^(ebitda|ebit|pat|pbt|eps|roce|roe)$/i.test(w) ? w.toUpperCase() : w.toLowerCase()));
  const out = words.join(" ");
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** The promise check as one plain sentence. The backend writes it from code-computed numbers. */
export function promiseSentence(pc: PromiseCheck): string {
  const note = (pc.note || "").replace(/^Illustrative sample:\s*/i, "").trim();
  if (note) return note.charAt(0).toUpperCase() + note.slice(1);
  return composedSentence(pc);
}

function composedSentence(pc: PromiseCheck): string {
  const metric = metricLabel(pc.metric);
  const guided = pc.guided_period ? ` guided on the ${fmtPeriod(pc.guided_period)} call` : " guided";
  if (pc.status === "no_guidance") return `Management gave no numeric ${metric.toLowerCase()} guidance FINN can check this against.`;
  if (pc.status === "not_reported" || pc.delivered == null) {
    return `${metric} not reported${pc.delivered_period ? ` for ${fmtPeriod(pc.delivered_period)}` : ""}. ${pc.guided_band}${guided}.`;
  }
  return `${metric} ${fmtPctPlain(pc.delivered)}${pc.delivered_period ? ` in ${fmtPeriod(pc.delivered_period)}` : ""} against ${pc.guided_band}${guided}.`;
}


/** Questions written for this kind of item, so the investor never starts from a blank box. */
export function questionsFor(a: Pick<Alert, "kind" | "payload" | "ticker">): string[] {
  const p = a.payload as Partial<AnnouncementPayload>;
  const t = a.ticker;
  if (a.kind !== "announcement") {
    return [
      `Did ${t} file anything that explains this move?`,
      `What did ${t} management last say about demand?`,
      `How have ${t}'s recent results trended?`,
    ];
  }
  switch (p.category) {
    case "results":
      return [
        `Did ${t} deliver what management promised?`,
        `What drove the change in ${t}'s margins this quarter?`,
        `What did ${t} guide for the rest of the year?`,
      ];
    case "management_change":
      return [
        `What has ${t} said about leadership and succession?`,
        `Has ${t} had other senior exits recently?`,
        `What did ${t}'s outgoing executive commit to?`,
      ];
    case "M&A":
    case "capex":
    case "fund_raise":
      return [
        `How does ${t} say this fits its capital allocation plan?`,
        `What return does ${t} expect from this investment?`,
        `How will this affect ${t}'s debt?`,
      ];
    case "litigation":
      return [
        `What has ${t} disclosed about this matter before?`,
        `How large could the impact be for ${t}?`,
        `Has ${t} faced similar regulatory actions?`,
      ];
    default:
      return [
        `What does this mean for ${t}?`,
        `Did ${t} deliver what management promised?`,
        `What did ${t} management say on the latest call?`,
      ];
  }
}

/** A short spoken version of the brief for the commute, including promise checks. */
export function spokenBrief(brief: Brief): string {
  const items = brief.material;
  if (!items.length) {
    return `Nothing needs a decision in this window. ${brief.worth_a_look.length} items are worth a look, and ${brief.routine_count} routine filings were hidden.`;
  }
  const lines = items.slice(0, 6).map((i, n) => {
    const p = i.payload as Partial<AnnouncementPayload>;
    const facts = p.facts?.rows
      ?.filter((r) => (r.label === "Revenue" || r.label === "PAT") && r.yoy_pct != null)
      .map((r) => `${r.label === "PAT" ? "profit" : "revenue"} ${r.yoy_pct! >= 0 ? "up" : "down"} ${Math.abs(r.yoy_pct!).toFixed(0)} percent on the year`)
      .join(", ");
    const pc = i.promise_check;
    let promise = "";
    if (pc) {
      const verdict = pc.status === "kept" ? " Promise kept." : pc.status === "missed" ? " Promise missed." : "";
      promise = `${verdict} ${promiseSentence(pc).replace(/%/g, " percent")}`;
      if (pc.is_illustrative) promise += " These are sample numbers.";
    }
    const factLine = facts ? ` ${facts.charAt(0).toUpperCase()}${facts.slice(1)}.` : "";
    return `${n === 0 ? "First" : "Next"}, ${i.ticker}. ${headlineOf(i).replace(/\.$/, "")}.${factLine}${promise} This bears on ${i.touches}.`;
  });
  const more = items.length > 6 ? ` And ${items.length - 6} more on screen.` : "";
  return `${items.length} ${items.length === 1 ? "item needs" : "items need"} a decision. ${lines.join(" ")}${more} ${brief.routine_count} routine filings were hidden.`;
}
