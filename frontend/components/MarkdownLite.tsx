"use client";

import { Fragment, type ReactNode } from "react";

/**
 * Markdown-lite renderer: **bold**, bullet lists, numbered lists,
 * ### headings and paragraph breaks. Zero dependencies.
 */

type CiteRenderer = (n: number, key: string) => ReactNode;

function inline(text: string, keyBase: string, cite?: CiteRenderer): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[S?(\d{1,3})\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<Fragment key={`${keyBase}-t${i}`}>{text.slice(last, m.index)}</Fragment>);
    if (m[1] != null) {
      out.push(
        <strong key={`${keyBase}-b${i}`} className="fin-strong">
          {m[1]}
        </strong>
      );
    } else if (cite) {
      out.push(cite(Number(m[2]), `${keyBase}-c${i}`));
    } else {
      out.push(<Fragment key={`${keyBase}-c${i}`}>{m[0]}</Fragment>);
    }
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) out.push(<Fragment key={`${keyBase}-t${i}`}>{text.slice(last)}</Fragment>);
  return out;
}

export default function MarkdownLite({ text, cite }: { text: string; cite?: CiteRenderer }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let ordered = false;
  let key = 0;

  const flushPara = () => {
    if (!para.length) return;
    const joined = para.join(" ");
    blocks.push(
      <p key={`p${key++}`} className="fin-p">
        {inline(joined, `p${key}`, cite)}
      </p>
    );
    para = [];
  };
  const flushList = () => {
    if (!list.length) return;
    const items = list.map((l, i) => (
      <li key={`li${i}`} className="fin-li">
        {inline(l, `li${key}-${i}`, cite)}
      </li>
    ));
    blocks.push(
      ordered ? (
        <ol key={`l${key++}`} className="fin-ul" style={{ listStyleType: "decimal" }}>
          {items}
        </ol>
      ) : (
        <ul key={`l${key++}`} className="fin-ul">
          {items}
        </ul>
      )
    );
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    const h = line.match(/^#{1,4}\s+(.*)/);
    if (h) {
      flushPara();
      flushList();
      blocks.push(
        <p key={`h${key++}`} className="mb-1 mt-2 text-[15px] font-bold text-black">
          {inline(h[1], `h${key}`, cite)}
        </p>
      );
      continue;
    }
    const bullet = line.match(/^\s*[-*•]\s+(.*)/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (bullet) {
      flushPara();
      if (ordered) flushList();
      ordered = false;
      list.push(bullet[1]);
      continue;
    }
    if (numbered) {
      flushPara();
      if (!ordered) flushList();
      ordered = true;
      list.push(numbered[1]);
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();

  return <div>{blocks}</div>;
}
