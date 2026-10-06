# Smart Mine Safety System — Rebuild Handbook

**Document type:** Rebuild & teaching manual  
**Audience:** Engineers who must re-implement, extend, or fully understand this monorepo  
**Source of truth:** The codebase in this repository + `docs/architecture.md`  
**Companion:** `docs/CLAUDE_BOOK_PROMPT.md` — paste into Claude with a project zip to expand this into a 100+ page PDF/DOCX book  

---

## How to use this handbook

1. Read chapters **01 → 12** in order if you are rebuilding from scratch.
2. Keep the running app open (`backend :8000`, `frontend :5173`) while reading code chapters.
3. After each chapter, complete the **Exercises** section before moving on.
4. To produce a single printable volume:

```bash
# from repo root
python docs/rebuild-handbook/build_book.py
# writes docs/rebuild-handbook/_BUILD/SMART_MINE_REBUILD_HANDBOOK.md
```

5. To ask Claude for a **100+ page** expanded book, zip the project (see script below) and use `docs/CLAUDE_BOOK_PROMPT.md`.

```powershell
# Windows PowerShell — from repo root
.\docs\rebuild-handbook\make_claude_zip.ps1
# creates smart-mine-claude-pack.zip
```

---

## Chapter map

| Ch | File | Topic | Est. pages (seed) | Expanded target |
|----|------|-------|-------------------|-----------------|
| 01 | `01-vision-and-scope.md` | Problem, goals, non-goals | ~6 | ~10 |
| 02 | `02-theory-mine-rtls.md` | Underground RTLS & LoRa theory | ~12 | ~18 |
| 03 | `03-theory-positioning-math.md` | Path loss, multilateration, map-match | ~14 | ~20 |
| 04 | `04-system-architecture.md` | Boxes, buses, migration seam | ~10 | ~14 |
| 05 | `05-tools-and-environment.md` | Toolchain, Docker, env | ~8 | ~12 |
| 06 | `06-config-and-world-model.md` | JSON world seed | ~10 | ~14 |
| 07 | `07-backend-rebuild.md` | FastAPI, sim loop, modules | ~16 | ~22 |
| 08 | `08-frontend-rebuild.md` | React dashboard + 3D map | ~12 | ~18 |
| 09 | `09-apis-mqtt-websocket.md` | Contracts | ~10 | ~14 |
| 10 | `10-testing-and-scenarios.md` | pytest, vitest, drills | ~8 | ~12 |
| 11 | `11-operations-runbook.md` | Run, debug, ops | ~8 | ~12 |
| 12 | `12-rebuild-checklist.md` | Greenfield rebuild order | ~6 | ~10 |
| — | Appendices A–D | Glossary, topics, file index, formulas | ~10 | ~14 |

**Seed handbook ≈ 130 pages when expanded by Claude using the pack prompt.**  
This folder is the **authoritative seed**; Claude expands prose, diagrams, and worked examples without inventing APIs that are not in the zip.

---

## Learning outcomes

After completing this handbook you should be able to:

- Explain why the dashboard never receives miner ground-truth coordinates.
- Rebuild the monorepo folder structure and wire MQTT → positioning → alerts → UI.
- Derive RSSI → distance → least-squares position and snap it to a tunnel graph.
- Add a new gateway, worker, sensor, alert threshold, or UI page safely.
- Run local and Docker stacks; inject scenarios; interpret logs by tag.
- Describe the hardware migration path (simulator → real LoRaWAN) without rewriting positioning or the dashboard.

---

## Related documents

- `docs/architecture.md` — short diagram reference  
- Root `README.md` — quick start  
- Canvas course: `smart-mine-system-course.canvas.tsx` (in Cursor canvases) — interactive syllabus  
