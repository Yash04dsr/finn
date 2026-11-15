"""Vercel build step: bake the research corpus and sample-day ledgers into data/finn.db.

The function bundle is read-only and each instance starts from this file, so work done
here is not repeated on every cold start.
"""
import asyncio
import logging

from finn import db
from finn.ingest.official_docs import seed_official_documents

logging.basicConfig(level=logging.INFO)


async def main() -> None:
    db._get_conn()
    db.ensure_fts()
    print(seed_official_documents())
    from finn.api.main import _warm_sample_ledgers

    await _warm_sample_ledgers()
    db._get_conn().execute("PRAGMA wal_checkpoint(TRUNCATE)")


if __name__ == "__main__":
    asyncio.run(main())
