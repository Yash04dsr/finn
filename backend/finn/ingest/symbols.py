"""Resolve any NSE/BSE company a message names, by symbol or by company name.

The NSE equity list (data/snapshots/nse_equity_list.csv, from
nsearchives.nseindia.com/content/equities/EQUITY_L.csv) maps every listed symbol to
its registered name, so routing never depends on which companies FINN has seen.
Screener's company search is the fallback for BSE-only listings.
"""
from __future__ import annotations

import csv
import logging
import os
import re
import time
from functools import lru_cache

import requests

from ..config import SNAPSHOT_DIR

log = logging.getLogger("finn.symbols")

LIST_PATH = SNAPSHOT_DIR / "nse_equity_list.csv"
SCREENER_SEARCH = "https://www.screener.in/api/company/search/"
HEADERS = {"User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")}

# Ordinary English words that are also an NSE symbol and the first word of that company's
# name. Typed in lowercase they are almost always the word, not the company.
_ENGLISH = frozenset("""
abb accuracy advance affordable alkali amber anthem apex astral aurum awl aye bang beta
butterfly campus capillary celebrity cello centrum centum chalet corona craftsman crest crown
den dollar dolphin elevate empower endurance ester eternal flair focus gateway german gland
graphite hexagon incredible intellect knack lancer lovable magnum mankind marathon marine
matrimony medico mercantile metropolis monarch nucleus panache panorama par persistent praxis
prestige priority prudent pyramid quint race rain rainbow reliable route sab safari sapphire
satin signpost sis skipper speciality spectrum stallion sunshine symphony take til total
touchwood trident veranda veto vital wealth whirlpool
""".split())
_STOP = frozenset({"limited", "ltd"})
_NAME_WORD = re.compile(r"[a-z0-9]+")


def _words(text: str) -> list[str]:
    text = re.sub(r"\(.*?\)", " ", text.lower().replace("&", " and "))
    return _NAME_WORD.findall(text)


def _core(name: str) -> list[str]:
    words = [w for w in _words(name) if w not in _STOP]
    return words[1:] if words[:1] == ["the"] else words


@lru_cache(maxsize=1)
def nse_companies() -> dict[str, str]:
    """Symbol -> registered company name for every NSE-listed equity."""
    if not LIST_PATH.exists():
        return {}
    with LIST_PATH.open(newline="", encoding="utf-8") as fh:
        return {row["SYMBOL"].strip().upper(): row["NAME OF COMPANY"].strip()
                for row in csv.DictReader(fh) if row.get("SYMBOL")}


@lru_cache(maxsize=1)
def _name_index() -> tuple[dict[tuple[str, ...], str], dict[tuple[str, str], str], dict[str, str]]:
    """Full names, unique two-word name prefixes, and symbols that are also the name's first word."""
    full: dict[tuple[str, ...], str] = {}
    prefix_seen: dict[tuple[str, str], set[str]] = {}
    first_seen: dict[str, set[str]] = {}
    for symbol, name in nse_companies().items():
        core = _core(name)
        if not core:
            continue
        if len(core) >= 2:
            full.setdefault(tuple(core), symbol)
            # "Dixon Technologies (India)" and "Granules India" are typed without "India".
            if core[-1] == "india" and len(core) >= 3:
                full.setdefault(tuple(core[:-1]), symbol)
        if len(core) >= 3:
            prefix_seen.setdefault((core[0], core[1]), set()).add(symbol)
        first_seen.setdefault(core[0], set()).add(symbol)
    prefixes = {k: next(iter(v)) for k, v in prefix_seen.items() if len(v) == 1}
    single = {w: next(iter(v)) for w, v in first_seen.items()
              if len(v) == 1 and next(iter(v)).lower() == w and len(w) >= 4}
    return full, prefixes, single


def is_listed(symbol: str) -> bool:
    return symbol.upper() in nse_companies()


def company_name(symbol: str) -> str | None:
    return nse_companies().get(symbol.upper())


def match_name(message: str) -> str | None:
    """The NSE symbol whose company name the message mentions, longest name first."""
    full, prefixes, single = _name_index()
    words = _words(message)
    capitalised = {w.lower() for w in re.findall(r"\b[A-Z][A-Za-z0-9]*", message)}
    for size in range(min(len(words), 8), 1, -1):
        for i in range(len(words) - size + 1):
            symbol = full.get(tuple(words[i:i + size]))
            if symbol:
                return symbol
    for a, b in zip(words, words[1:]):
        if a in capitalised and b in capitalised and (a, b) in prefixes:
            return prefixes[(a, b)]
    for w in words:
        if w in single and w not in _ENGLISH:
            return single[w]
    return None


_search_cache: dict[str, tuple[float, str | None]] = {}
_SEARCH_TTL_S = 24 * 3600


def screener_search(token: str) -> str | None:
    """Symbol (or BSE code) of the company Screener finds for a symbol-like token."""
    if os.getenv("FINN_TEST_DB") == "1" or os.getenv("FINN_OFFLINE") == "1":
        return None
    key = token.upper()
    hit = _search_cache.get(key)
    if hit and time.time() - hit[0] < _SEARCH_TTL_S:
        return hit[1]
    found = None
    try:
        resp = requests.get(SCREENER_SEARCH, params={"q": token}, headers=HEADERS, timeout=4)
        if resp.ok:
            for row in resp.json()[:5]:
                m = re.match(r"/company/([A-Za-z0-9&.-]+)/", str(row.get("url") or ""))
                if not m:
                    continue
                slug = m.group(1).upper()
                # BSE-only companies are addressed by their numeric BSE code.
                named = (_words(str(row.get("name") or "")) or [""])[0] == key.lower()
                if slug == key or (slug.isdigit() and named):
                    found = slug
                    break
    except (requests.RequestException, ValueError) as exc:
        log.info("screener search failed for %s: %s", token, exc)
    _search_cache[key] = (time.time(), found)
    return found
