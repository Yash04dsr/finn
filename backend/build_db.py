"""Build step: bake the research corpus, sample-day ledgers and the sample day into the DB.

Serverless instances each start from the bundled file, so work done here is not repeated
on every cold start and every instance serves the same brief. The sample day is anchored
to build time; a daily redeploy keeps it inside the brief's 24-hour window.
"""
import asyncio
import logging
import os

from finn import db
from finn.ingest.official_docs import seed_official_documents

logging.basicConfig(level=logging.INFO)


async def main() -> None:
    db._get_conn()
    db.ensure_fts()
    print(seed_official_documents())
    from finn.api.main import _warm_sample_ledgers
    from finn.pipeline import run_pipeline

    await _warm_sample_ledgers()
    if os.getenv("FINN_BAKE_SAMPLE_DAY", "1") == "1":
        print(await run_pipeline(push=False, sample=True))
    db._get_conn().execute("PRAGMA wal_checkpoint(TRUNCATE)")


if __name__ == "__main__":
    asyncio.run(main())
