"""Server-side citation contract for grounded answers.

The model may only cite sources that a tool returned during the same turn. This
module collects those sources from tool responses, keeps citations that match,
drops any that do not, renumbers them for reading, and returns structured source
records the clients can open.
"""
from __future__ import annotations

import re

_MARKER = re.compile(r"\[((?:S|M)\d+)\]")
_SOURCES_BLOCK = re.compile(r"\n\s*(?:\*\*)?sources?(?:\*\*)?\s*:?\s*\n.*\Z", re.IGNORECASE | re.DOTALL)


def collect_sources(response, registry: dict[str, dict]) -> None:
    """Record every dict carrying a source_id inside a tool response."""
    if isinstance(response, dict):
        sid = response.get("source_id")
        if isinstance(sid, str) and _MARKER.fullmatch(f"[{sid}]"):
            registry.setdefault(sid, {
                "id": sid,
                "title": response.get("doc_title") or response.get("source_title") or "",
                "doc_type": response.get("doc_type") or "metric",
                "period": response.get("period") or "",
                "url": response.get("url") or "",
                "excerpt": (response.get("excerpt") or "")[:400],
                "provider": response.get("source_provider") or "",
            })
        for value in response.values():
            collect_sources(value, registry)
    elif isinstance(response, list):
        for value in response:
            collect_sources(value, registry)


def collect_from_event(event, registry: dict[str, dict]) -> None:
    """Pull tool responses off an ADK event."""
    content = getattr(event, "content", None)
    for part in getattr(content, "parts", None) or []:
        fr = getattr(part, "function_response", None)
        if fr is not None:
            collect_sources(getattr(fr, "response", None), registry)


def finalize(text: str, registry: dict[str, dict]) -> tuple[str, list[dict], list[str]]:
    """Return (clean_text, citations, rejected_ids).

    Markers that match a returned source become [1], [2], … in order of first use.
    Markers that do not match any returned source are removed and reported.
    """
    body = _SOURCES_BLOCK.sub("", text or "").rstrip()
    # "[S1, S2]" and "[S1; S2]" become "[S1][S2]" so each id is checked on its own.
    body = re.sub(r"\[((?:[SM]\d+\s*[,;]\s*)+[SM]\d+)\]",
                  lambda m: "".join(f"[{p.strip()}]" for p in re.split(r"[,;]", m.group(1))), body)
    order: dict[str, int] = {}
    rejected: list[str] = []

    def renumber(match: re.Match) -> str:
        sid = match.group(1)
        if sid not in registry:
            if sid not in rejected:
                rejected.append(sid)
            return ""
        if sid not in order:
            order[sid] = len(order) + 1
        return f"[{order[sid]}]"

    body = _MARKER.sub(renumber, body)
    body = re.sub(r"[ \t]+([.,;:])", r"\1", body)
    body = re.sub(r"[ \t]{2,}", " ", body).strip()
    citations = [{**registry[sid], "n": n} for sid, n in sorted(order.items(), key=lambda kv: kv[1])]
    return body, citations, rejected
