#!/usr/bin/env python3
"""Concatenate rebuild-handbook chapters into one Markdown volume."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT / "_BUILD"
OUT_FILE = OUT_DIR / "SMART_MINE_REBUILD_HANDBOOK.md"

ORDER = [
    "00-README.md",
    "01-vision-and-scope.md",
    "02-theory-mine-rtls.md",
    "03-theory-positioning-math.md",
    "04-system-architecture.md",
    "05-tools-and-environment.md",
    "06-config-and-world-model.md",
    "07-backend-rebuild.md",
    "08-frontend-rebuild.md",
    "09-apis-mqtt-websocket.md",
    "10-testing-and-scenarios.md",
    "11-operations-runbook.md",
    "12-rebuild-checklist.md",
    "A-appendices.md",
]


def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)
    parts: list[str] = []
    words = 0
    for name in ORDER:
        path = ROOT / name
        if not path.exists():
            raise SystemExit(f"missing {path}")
        text = path.read_text(encoding="utf-8").strip() + "\n"
        words += len(text.split())
        parts.append(text)
        parts.append("\n\n---\n\n")
    body = "".join(parts)
    header = (
        "---\ntitle: \"Smart Mine Safety System — Rebuild Handbook (Seed Volume)\"\n"
        "subtitle: \"Concatenate of docs/rebuild-handbook — expand via CLAUDE_BOOK_PROMPT.md for 100+ pages\"\n"
        "---\n\n"
    )
    OUT_FILE.write_text(header + body, encoding="utf-8")
    pages_est = max(1, words // 450)
    print(f"Wrote {OUT_FILE}")
    print(f"Words ~ {words} | rough page estimate @450 w/p ~ {pages_est}")
    print("For 100+ pages, use docs/CLAUDE_BOOK_PROMPT.md with the Claude zip pack.")


if __name__ == "__main__":
    main()
