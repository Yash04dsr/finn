"""Seed explicitly labelled synthetic demo documents.

These are illustrative demo transcripts (shaped like real earnings calls) so the
grounded Pull demos work instantly without downloading PDFs. Live PDF ingestion
remains available via docs.py for any ticker.
"""
from __future__ import annotations

import re

from .. import db

DEMO_DOC_TYPE = "illustrative_demo"
DEMO_TITLE_PREFIX = "[ILLUSTRATIVE DEMO — NOT OFFICIAL]"
DEMO_NOTICE = (
    "[ILLUSTRATIVE DEMO — SYNTHETIC CONTENT, NOT AN OFFICIAL SOURCE] "
)

# Each entry: (doc_type, title, period, url, [paragraphs])
PERSISTENT_TRANSCRIPTS = [
    {
        "doc_type": "transcript",
        "title": "Q1 FY26 Earnings Conference Call",
        "period": "Q1FY26",
        "url": None,
        "paras": [
            "Moderator: Thank you and welcome to the Persistent Systems Q1 FY26 earnings call. Management was represented by Dr. Anand Deshpande, Chairman and MD, and Sunil Sapre, CFO.",
            "Sunil Sapre (CFO): Revenue for the quarter was USD 366 million, up 3.6 percent quarter-on-quarter in USD terms and 21 percent year-on-year in rupee terms at 3,080 crore. EBITDA margin stood at 18.4 percent, an improvement of 40 basis points sequentially.",
            "Sunil sapre (CFO): We are reiterating our guidance of growing faster than the industry. For the full year we continue to target revenue growth in the low twenties percentage band in rupee terms, with EBITDA margins in the 18 to 19 percent range.",
            "Analyst (Ravi Sarin, Bank of America): Your guidance was low twenties growth but you have delivered 21 percent. Are you comfortable with the second half visibility?",
            "Sunil Sapre (CFO): Yes, the deal pipeline remains strong with total contract value bookings of USD 547 million this quarter. We have signed four large deals, and our book-to-bill was 1.25x. We remain comfortable with our full year guidance.",
            "Dr. Anand Deshpande (Chairman): Our headcount stood at 24,190, and we added 551 net freshers this quarter. Attrition has declined to 11.5 percent. We are investing in our AI-led platform play, and we see strong traction in the banking, financial services and healthcare verticals.",
            "Analyst (Sudheer Gokhale, Morningstar): On margins, you said 18 to 19 percent, but your last three quarters have been 17.2, 17.6, 18.4. When does the margin expansion actually get delivered?",
            "Sunil Sapre (CFO): The margin trajectory is on track. We expect to exit the year at about 19 percent EBITDA margin. The utilization improvement and pyramid rationalization actions we announced last year are now showing results.",
            "Moderator: Thank you. That concludes the Q1 FY26 earnings call.",
        ],
    },
    {
        "doc_type": "transcript",
        "title": "Q4 FY25 Earnings Conference Call",
        "period": "Q4FY25",
        "url": None,
        "paras": [
            "Sunil Sapre (CFO): For the full year FY25, revenue grew 23.5 percent in rupee terms to 10,778 crore. Q4 revenue was 2,941 crore, up 5.9 percent sequentially. EBITDA margin for the quarter was 18.1 percent.",
            "Sunil Sapre (CFO): For FY26, we guide to revenue growth of 18 to 22 percent in rupee terms and EBITDA margins of 18 to 19 percent. Capex will remain at about 2.5 percent of revenue as we expand our Nagpur and Hyderabad campuses.",
            "Analyst (Param Subramaniam, Citi): You have consistently beaten your own guidance for five quarters now. What changed in the operating model?",
            "Dr. Anand Deshpande (Chairman): The mid-market focused AI-led services strategy is compounding. Our mid-market segment grew 27 percent this year. Large deals take longer but the mid-market gives us velocity.",
            "Sunil Sapre (CFO): We also closed the FY25 year with cash and investments of 1,460 crore after paying 148 crore of dividends. We have not raised debt in the last six years.",
            "Moderator: That concludes the Q4 FY25 call.",
        ],
    },
    {
        "doc_type": "transcript",
        "title": "Q2 FY26 Earnings Conference Call",
        "period": "Q2FY26",
        "url": None,
        "paras": [
            "Moderator: Welcome to the Persistent Systems Q2 FY26 earnings call. Sunil Sapre announced his resignation before this call; Piyush Pandey, interim financial controller, is deputizing for finance.",
            "Piyush Pandey (Interim Financial Controller): Q2 FY26 revenue was 3,207 crore, up 4.1 percent quarter-on-quarter and 22.8 percent year-on-year. EBITDA margin expanded 80 basis points sequentially to 19.2 percent. PAT was 410 crore, up 7.3 percent sequentially.",
            "Piyush Pandey (Interim Financial Controller): The CFO transition will not affect our guidance. We reiterate full-year revenue growth guidance of 18 to 22 percent in rupee terms and exit EBITDA margin of 19 percent.",
            "Analyst (Ravi Sarin, Bank of America): With the CFO leaving, is the 19 percent margin exit target still credible, and what is the timeline to appoint a permanent CFO?",
            "Piyush Pandey (Interim Financial Controller): The finance leadership bench is deep; the transition is smooth. The search for a permanent CFO is underway with a reputed firm, and we expect to conclude it by Q4 FY26. The margin trajectory is unaffected; utilization at 74.2 percent gives further headroom.",
            "Analyst (Sudheer Gokhale, Morningstar): TCV bookings this quarter and the book-to-bill, please.",
            "Piyush Pandey (Interim Financial Controller): TCV was USD 601 million, book-to-bill 1.19x. Large deal signings remain healthy; mid-market grew 3.1 percent sequentially, faster than the enterprise segment.",
            "Moderator: That concludes the Q2 FY26 call.",
        ],
    },
]

PERSISTENT_RESULTS = [
    {
        "doc_type": "results_filing",
        "title": "Q2 FY26 Results Filing (Exchange Filing)",
        "period": "Q2FY26",
        "url": None,
        "paras": [
            "Segment revenue: Enterprise Integration Services 1,244 crore; Application Development and Maintenance 987 crore; Digital Engineering and Cloud 976 crore.",
            "Geographic mix: North America 72 percent of revenue, Europe 17 percent, Rest of World 11 percent.",
            "Cash flow from operations for the half year was 728 crore against PAT of 792 crore; capex for the half year was 96 crore.",
            "The board approved the appointment of an interim financial controller following the resignation of the Chief Financial Officer effective November 30, 2025.",
        ],
    },
]

CROMPTON_TRANSCRIPTS = [
    {
        "doc_type": "transcript",
        "title": "Q2 FY26 Earnings Conference Call",
        "period": "Q2FY26",
        "url": None,
        "paras": [
            "Management: Q2 FY26 revenue grew 9.4 percent year-on-year to 2,112 crore. The lighting business declined 2 percent while the electrical segment grew 16 percent on strong pumps and residential wiring demand.",
            "Management: On fans, our BLDC portfolio now contributes 24 percent of fan revenue, up from 15 percent last year. We target 35 percent by FY27. EBITDA margin was 12.2 percent against 11.8 percent last year same quarter.",
            "Analyst (Deepa Menon, ICICI Securities): Your Q2 PAT of 168 crore is up 38.8 percent year-on-year, well ahead of the 9.4 percent top line. Is this margin run-rate sustainable?",
            "Management: Part of the PAT growth came from other income and lower commodity costs. Sustainable EBITDA margin for the consumer electricals business remains in the 12 to 13 percent band; we guide FY26 at the upper end of this range.",
            "Management: On the Tormin acquisition integration, the industrial business is on track for revenue synergies of 60 crore this year.",
            "Analyst (Karan Bhatia, Nomura): Channels checks suggest channel inventory in fans is elevated. What is your inventory position?",
            "Management: Channel inventory is at 5.5 weeks against a normal range of 4 to 5 weeks; the festive offtake should normalize it by December. We do not see any stocking risk.",
            "Moderator: Concludes the Q2 FY26 call.",
        ],
    },
]

IRCTC_TRANSCRIPTS = [
    {
        "doc_type": "transcript",
        "title": "Q2 FY26 Earnings Conference Call",
        "period": "Q2FY26",
        "url": None,
        "paras": [
            "Management: Q2 FY26 revenue was 1,017 crore, up 7.2 percent year-on-year. Ticketing revenue grew 6.1 percent on 8.4 percent growth in reserved ticket bookings; rail neer and catering combined grew 9 percent.",
            "Management: The standardisation of catering tariffs is under review with the Railway Board. Any revision will be margin-accretive for the catering segment where current margin is 24 percent.",
            "Analyst (Alok Deshpande, Dalal Street Investments): The convenience fee haircut for non-AC classes that was announced in August - what is the annualized revenue impact?",
            "Management: The convenience fee reduction impacts about 38 percent of our ticket bookings. Annualized impact is approximately 110 crore of revenue, partially offset by volume growth of about 4 percent that we expect from improved demand elasticity.",
            "Management: PAT for the quarter was 307 crore, up 27.9 percent year-on-year, aided by other income of 68 crore from cash and investments of 3,200 crore.",
            "Moderator: Concludes the Q2 FY26 call.",
        ],
    },
]


def seed_all() -> dict:
    """Load labelled demo fixtures without presenting them as primary sources."""
    from ..config import DOCS_DIR

    corpus = {
        "PERSISTENT": PERSISTENT_TRANSCRIPTS + PERSISTENT_RESULTS,
        "CROMPTON": CROMPTON_TRANSCRIPTS,
        "IRCTC": IRCTC_TRANSCRIPTS,
    }
    stats = {}
    for ticker, docs in corpus.items():
        n = 0
        for d in docs:
            stored = _demo_metadata(ticker, d)
            # Remove rows created by older versions that falsely looked official.
            with db.db() as conn:
                conn.execute(
                    "DELETE FROM chunks WHERE ticker=? AND doc_title=?",
                    (ticker, d["title"]),
                )
                existing = conn.execute(
                    "SELECT 1 FROM chunks WHERE ticker=? AND doc_title=? LIMIT 1",
                    (ticker, stored["title"]),
                ).fetchone()
            if existing:
                continue
            for seq, para in enumerate(d["paras"]):
                db.add_chunk(
                    ticker,
                    stored["doc_type"],
                    stored["title"],
                    d["period"],
                    stored["url"],
                    seq,
                    DEMO_NOTICE + para,
                )
                n += 1
        stats[ticker] = n
    db.ensure_fts()
    # also write a manifest for doc_overview
    import json
    manifest_path = DOCS_DIR / "manifest.json"
    manifest = {}
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
    for ticker, docs in corpus.items():
        manifest[ticker] = [
            {
                "doc_type": DEMO_DOC_TYPE,
                "original_doc_type": d["doc_type"],
                "title": _demo_metadata(ticker, d)["title"],
                "period": d["period"],
                "url": _demo_metadata(ticker, d)["url"],
                "file": None,
                "is_demo": True,
                "official_source": False,
                "source_status": "illustrative_synthetic_not_official",
            }
            for d in docs
        ]
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=1))
    return stats


def _demo_metadata(ticker: str, doc: dict) -> dict:
    slug = re.sub(r"[^a-z0-9]+", "-", doc["title"].lower()).strip("-")
    return {
        "doc_type": DEMO_DOC_TYPE,
        "title": f"{DEMO_TITLE_PREFIX} {doc['title']}",
        "url": f"illustrative-demo://{ticker.lower()}/{slug}",
    }


if __name__ == "__main__":
    print(seed_all())
