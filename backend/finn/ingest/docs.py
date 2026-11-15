"""PDF ingestion: chunk annual reports / transcripts / results into FTS5-searchable chunks."""
from __future__ import annotations

import logging
import re
import time
from pathlib import Path

import httpx

from .. import db
from ..config import DOCS_DIR, PDF_DIR

log = logging.getLogger("finn.docs")

# Chunking targets: small enough for precise citation, big enough for context.
CHUNK_CHARS = 1400
CHUNK_OVERLAP = 150


def chunk_text(text: str) -> list[str]:
    """Paragraph-aware chunking with overlap."""
    text = re.sub(r"[ \t]+", " ", text)
    paras = [p.strip() for p in text.split("\n") if len(p.strip()) > 40]
    chunks: list[str] = []
    buf = ""
    for p in paras:
        if len(buf) + len(p) + 1 <= CHUNK_CHARS:
            buf = (buf + "\n" + p).strip()
        else:
            if buf:
                chunks.append(buf)
            if len(p) <= CHUNK_CHARS:
                buf = p
            else:
                # hard-split very long paragraphs with overlap
                start = 0
                while start < len(p):
                    piece = p[start:start + CHUNK_CHARS]
                    chunks.append(piece)
                    start += CHUNK_CHARS - CHUNK_OVERLAP
                buf = ""
    if buf:
        chunks.append(buf)
    return chunks


def ingest_pdf(ticker: str, doc_type: str, title: str, period: str, url: str,
               pdf_path: Path) -> int:
    """Extract text from a local PDF and store chunks. Returns chunk count."""
    from pypdf import PdfReader

    try:
        reader = PdfReader(str(pdf_path))
    except Exception as exc:
        log.warning("PDF read failed %s: %s", pdf_path, exc)
        return 0
    # Extract per-page, then chunk across page boundaries.
    pages = []
    for i, page in enumerate(reader.pages):
        try:
            pages.append(page.extract_text() or "")
        except Exception:
            pages.append("")
    full = "\n".join(pages)
    # Drop header/footer noise repeated on every page (common in ARs).
    full = _strip_repeated_lines(full)
    chunks = chunk_text(full)
    for seq, ch in enumerate(chunks):
        db.add_chunk(ticker, doc_type, title, period, url, seq, ch)
    log.info("ingested %s %s: %d chunks", ticker, title, len(chunks))
    return len(chunks)


def _strip_repeated_lines(text: str) -> str:
    """Remove lines that appear on >30% of pages (running headers/footers)."""
    pages = text.split("\n")
    from collections import Counter
    counts = Counter(l.strip() for l in pages if 10 < len(l.strip()) < 120)
    if not counts:
        return text
    n_pages = max(text.count("\f") + 1, 1)
    repeated = {l for l, c in counts.items() if c > max(3, n_pages * 0.3)}
    if not repeated:
        return text
    kept = [l for l in pages if l.strip() not in repeated]
    return "\n".join(kept)


def download_pdf(url: str, dest: Path, timeout: float = 30.0) -> bool:
    """Download to a temp name and move into place, so a cut-off download is never read."""
    partial = dest.with_suffix(".part")
    deadline = time.monotonic() + timeout
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        with httpx.stream("GET", url, timeout=min(timeout, 20.0), follow_redirects=True,
                          headers={"User-Agent": "Mozilla/5.0"}) as r:
            r.raise_for_status()
            with open(partial, "wb") as f:
                for block in r.iter_bytes(65536):
                    if time.monotonic() > deadline:
                        raise TimeoutError(f"took longer than {timeout:.0f}s")
                    f.write(block)
        partial.replace(dest)
        return dest.stat().st_size > 10_000
    except Exception as exc:
        partial.unlink(missing_ok=True)
        log.warning("pdf download failed %s: %s", url, exc)
        return False


def ingest_ticker_docs(ticker: str, docs: list[dict], max_docs: int = 6) -> int:
    """Ingest a list of {doc_type,title,url,file?} docs for a ticker. Returns total chunks."""
    total = 0
    for d in docs[:max_docs]:
        local = DOCS_DIR / d["file"] if d.get("file") else None
        if local is None or not local.exists():
            if not d.get("url"):
                continue
            fname = f"{ticker}_{d['doc_type']}_{abs(hash(d['url'])) % 10**8}.pdf"
            local = PDF_DIR / fname
            if not download_pdf(d["url"], local):
                continue
        n = ingest_pdf(ticker, d["doc_type"], d.get("title", d["doc_type"]),
                       d.get("period", ""), d.get("url", ""), local)
        total += n
    return total
