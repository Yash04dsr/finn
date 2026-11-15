"""Deterministic chat routing: decide in code which agent answers.

Any question about a specific company goes to the grounded research analyst, so
the fast assistant never answers company questions from model memory.
"""
from __future__ import annotations

import re

from .. import db
from ..config import ADHOC, PORTFOLIO

# Common names investors type instead of the NSE symbol.
NAME_ALIASES = {
    "persistent": "PERSISTENT", "crompton": "CROMPTON", "reliance": "RELIANCE",
    "hdfc bank": "HDFCBANK", "hdfc": "HDFCBANK", "tcs": "TCS", "tata consultancy": "TCS",
    "infosys": "INFY", "titan": "TITAN", "asian paints": "ASIANPAINT", "larsen": "LT",
    "l&t": "LT", "federal bank": "FEDERALBNK", "astral": "ASTRAL", "supreme": "SUPREMEIND",
    "bharat forge": "BHARATFORG", "campus": "CAMPUS", "granules": "GRANULES",
    "neuland": "NEULANDLAB", "gravita": "GRAVITA", "irctc": "IRCTC", "irfc": "IRFC",
    "paytm": "PAYTM", "suzlon": "SUZLON", "vedanta": "VEDL", "sbi": "SBIN",
    "state bank": "SBIN", "wipro": "WIPRO", "itc": "ITC", "bajaj finance": "BAJFINANCE",
    "zomato": "ETERNAL", "mahindra": "M&M", "kotak": "KOTAKBANK", "icici bank": "ICICIBANK",
    "hul": "HINDUNILVR", "airtel": "BHARTIARTL", "sun pharma": "SUNPHARMA", "maruti": "MARUTI",
}

_SYMBOL = re.compile(r"\b[A-Z][A-Z0-9&-]{0,18}[A-Z0-9]\b")
_NOT_TICKERS = {"I", "A", "AI", "EOD", "QOQ", "YOY", "EBITDA", "EBIT", "PAT", "PBT", "CEO", "CFO",
                "COO", "CTO", "FY", "Q1", "Q2", "Q3", "Q4", "H1", "H2", "NSE", "BSE", "AGM", "EGM",
                "ESOP", "MD", "OK", "USD", "INR", "GDP", "RBI", "SEBI", "IPO", "EPS", "ROE", "ROCE",
                "CAGR", "CAPEX", "OPM", "NPA", "GST", "US", "UK", "EU", "PLI", "ESG", "AGR", "NIM"}


def known_tickers() -> set[str]:
    """Every symbol FINN holds any data for, plus the portfolio and watchlist."""
    from ..tools.portfolio import watchlist_extra

    found = set(PORTFOLIO) | set(ADHOC) | set(watchlist_extra())
    with db.db() as c:
        for table in ("chunks", "prices", "quarterly"):
            found |= {r[0] for r in c.execute(f"SELECT DISTINCT ticker FROM {table}")}
    return found


def detect_ticker(message: str) -> str | None:
    """Find the company a message is about, by symbol or by name, for any listed company.

    Order: common nicknames, symbols FINN already holds, any NSE symbol written in
    capitals, a company name from the NSE list, then Screener search for a capitalised
    token NSE does not list (BSE-only companies).
    """
    from ..ingest import symbols

    low = message.lower()
    for name, symbol in sorted(NAME_ALIASES.items(), key=lambda kv: -len(kv[0])):
        if re.search(rf"\b{re.escape(name)}\b", low):
            return symbol
    known = known_tickers()
    original = set(_SYMBOL.findall(message))
    for token in _SYMBOL.findall(message.upper()):
        # Short words typed in lowercase ("it", "on") only count when written as a symbol.
        if len(token) <= 3 and token not in original:
            continue
        if token in known and token not in _NOT_TICKERS:
            return token
    written = [t for t in dict.fromkeys(_SYMBOL.findall(message)) if t not in _NOT_TICKERS and len(t) >= 2]
    for token in written:
        if symbols.is_listed(token):
            return token
    by_name = symbols.match_name(message)
    if by_name:
        return by_name
    for token in written:
        # Plain words typed in capitals for emphasis are not looked up.
        if len(token) >= 3 and not token.isdigit() and token.lower() not in _COMMON_CAPS:
            found = symbols.screener_search(token)
            if found:
                return found
    return None


_COMMON_CAPS = {"what", "why", "how", "when", "who", "did", "does", "the", "and", "for", "not",
                "all", "any", "this", "that", "with", "about", "guide", "guidance", "results",
                "margin", "margins", "revenue", "profit", "growth", "debt", "cash", "call",
                "risk", "risks", "please", "urgent", "now", "today", "update", "news", "stock",
                "stocks", "company", "share", "shares", "price", "quarter", "year", "next", "last"}


_PORTFOLIO_WIDE = re.compile(r"\b(portfolio|holdings|my stocks|brief|digest|today's alerts)\b", re.I)


def route(message: str, ticker: str | None, last_ticker: str | None) -> tuple[str, str | None]:
    """Return ("research", ticker) for company questions, else ("assistant", None)."""
    found = ticker or detect_ticker(message)
    if found:
        return "research", found
    if last_ticker and len(message.split()) <= 25 and not _PORTFOLIO_WIDE.search(message):
        return "research", last_ticker
    return "assistant", None
