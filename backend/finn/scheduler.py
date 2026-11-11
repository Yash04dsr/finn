"""APScheduler wiring: EOD run at 18:30 IST (after NSE filing window closes)."""
from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from .pipeline import run_pipeline

log = logging.getLogger("finn.scheduler")

scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")


async def eod_job() -> None:
    log.info("EOD pipeline starting")
    try:
        stats = await run_pipeline(hours=24, push=True)
        log.info("EOD pipeline done: %s", stats)
    except Exception:
        log.exception("EOD pipeline failed")


def start_scheduler() -> None:
    scheduler.add_job(eod_job, CronTrigger(hour=18, minute=30, day_of_week="mon-fri"),
                      id="eod_pipeline", replace_existing=True)
    scheduler.start()
    log.info("scheduler started (EOD 18:30 IST, Mon-Fri)")


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
