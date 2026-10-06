"""
Structured tagged logging for the mine simulation.

Format: 2026-01-01 12:00:00 [LEVEL] [TAG] message
Tags match the product spec: SIMULATOR, RADIO, POSITION, ALERT, WEARABLE, JOB, MQTT, INFLUX.
"""
from __future__ import annotations
import logging
import sys

TAGS = ("SIMULATOR", "RADIO", "POSITION", "ALERT", "WEARABLE", "JOB", "MQTT", "INFLUX", "MAIN")


class TaggedFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        tag = getattr(record, "tag", record.name.split(".")[-1].upper())
        record.tag = tag
        return super().format(record)


def setup_logging(level: int = logging.INFO) -> None:
    root = logging.getLogger()
    if any(isinstance(h, logging.StreamHandler) for h in root.handlers):
        # Avoid double-config when reloaded under uvicorn --reload
        root.setLevel(level)
        return

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        TaggedFormatter("%(asctime)s [%(levelname)s] [%(tag)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
    )
    root.addHandler(handler)
    root.setLevel(level)


def get_logger(tag: str) -> logging.LoggerAdapter:
    """Return a logger that always emits with the given [TAG]."""
    tag = tag.upper()
    base = logging.getLogger(f"mine.{tag.lower()}")
    return logging.LoggerAdapter(base, {"tag": tag})
