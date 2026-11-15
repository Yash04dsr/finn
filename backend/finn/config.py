"""Central configuration for FINN backend."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from repo root (two levels up from this file's dir) then backend dir.
_ROOT = Path(__file__).resolve().parents[2]
for candidate in (_ROOT / ".env", Path(__file__).resolve().parents[1] / ".env"):
    if candidate.exists():
        load_dotenv(candidate, override=True)

BACKEND_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BACKEND_DIR / "data"
SNAPSHOT_DIR = DATA_DIR / "snapshots"
DOCS_DIR = DATA_DIR / "docs"
# Serverless hosts mount the bundle read-only; downloaded PDFs must go to a writable dir.
PDF_DIR = Path(os.getenv("FINN_PDF_DIR", str(DOCS_DIR))).expanduser()
BUNDLED_DB_PATH = DATA_DIR / "finn.db"
DB_PATH = Path(os.getenv("FINN_DB_PATH", str(BUNDLED_DB_PATH))).expanduser()

# --- LLM routing (two tiers via Hyde gateway) --------------------------------
HYDE_API_KEY = os.getenv("HYDE_API_KEY", "")
HYDE_BASE_URL = os.getenv("HYDE_BASE_URL", "https://inference.hyde.tech/v1")
# Fast tier: bulk classification, one-liners, formatting, small talk.
MODEL_FAST = os.getenv("FINN_MODEL_FAST", "hyde/glm-5.3-flash")
# Reasoning tier: grounded synthesis, narrative-vs-numbers, bull/bear.
# Same gateway model today (key restriction); swap in a stronger model via env
# without touching code — the routing/cost-ledger separation stays meaningful.
MODEL_REASONING = os.getenv("FINN_MODEL_REASONING", "hyde/glm-5.3-flash")

# Public-demo boundaries. Native clients do not use browser CORS; web origins are
# explicit and production deployments should set FINN_ALLOWED_ORIGINS.
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "FINN_ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8081",
    ).split(",")
    if origin.strip()
]
CHAT_RATE_PER_MINUTE = int(os.getenv("FINN_CHAT_RATE_PER_MINUTE", "20"))
MUTATION_RATE_PER_MINUTE = int(os.getenv("FINN_MUTATION_RATE_PER_MINUTE", "10"))
DEMO_RUN_RATE_PER_HOUR = int(os.getenv("FINN_DEMO_RUN_RATE_PER_HOUR", "2"))

# --- Demo universe ------------------------------------------------------------
PORTFOLIO = [
    "RELIANCE", "HDFCBANK", "TCS", "INFY", "TITAN", "ASIANPAINT", "LT",
    "PERSISTENT", "FEDERALBNK", "CROMPTON", "ASTRAL", "SUPREMEIND",
    "BHARATFORG", "CAMPUS", "GRANULES", "NEULANDLAB", "GRAVITA",
]
ADHOC = ["IRCTC", "IRFC", "PAYTM", "SUZLON"]
ALL_TICKERS = PORTFOLIO + ADHOC

# Hero companies get a seeded document corpus for instant research demos.
HERO_TICKERS = ["PERSISTENT", "CROMPTON", "TITAN", "ASTRAL", "IRCTC"]

DEFAULT_WINDOW_HOURS = 24
