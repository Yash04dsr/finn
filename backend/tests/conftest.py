"""Shared test fixtures: isolated DB per test session."""
import os
import sys
from pathlib import Path

# Ensure backend dir on path and test DB isolated from dev DB.
BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

os.environ["FINN_TEST_DB"] = "1"

import finn.db as db  # noqa: E402

# Point the DB at a temp file for the whole test session.
import tempfile  # noqa: E402

_tmp = tempfile.mkdtemp(prefix="finn_test_")
db.DB_PATH = Path(_tmp) / "test.db"
# Force re-open on the new path.
db._conn = None
