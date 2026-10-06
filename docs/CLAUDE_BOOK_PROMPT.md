# Claude prompt — expand this repo into a 100+ page Rebuild Manual

Use this file **together with** `smart-mine-claude-pack.zip` (created by `docs/rebuild-handbook/make_claude_zip.ps1`).

---

## Prompt (copy everything below the line into Claude)

---

You are a technical author and systems engineer. Your job is to produce a **single, professional Rebuild Manual** for the Smart Mine Safety System contained in the attached project zip.

### Hard requirements

1. **Length:** Minimum **100 pages** when rendered as PDF with:
   - body text ~11 pt
   - 1.15 line spacing
   - normal margins
   - including title page, TOC, chapters, diagrams (as Mermaid or ASCII), code listings, exercises, glossary  
   Rough target: **45,000–60,000 words**.

2. **Truthfulness:** Use **only** APIs, file paths, config keys, and behaviours that exist in the zip. If something is unclear, say “verify in code” and point to the file — **do not invent** endpoints or libraries.

3. **Structure:** Produce these sections in order:
   - Title page, copyright/lab notice, how to read this book
   - Table of contents
   - Part I — Vision & underground RTLS theory (expand Chapters 01–03 from `docs/rebuild-handbook/`)
   - Part II — Architecture & tools (expand 04–05)
   - Part III — World model & configuration (expand 06)
   - Part IV — Backend rebuild with code walkthroughs (expand 07; quote real snippets from the zip)
   - Part V — Frontend rebuild with 3D map deep dive (expand 08)
   - Part VI — Contracts: REST, MQTT, WebSocket (expand 09)
   - Part VII — Testing, scenarios, operations (expand 10–11)
   - Part VIII — Greenfield rebuild checklist week-by-week (expand 12)
   - Appendices: glossary, full file index, formula sheet, MQTT catalogue, REST catalogue, troubleshooting tree, sample exam (30 questions + answers)

4. **Teaching style:** Each chapter must include:
   - Learning objectives
   - Theory
   - How this repo implements it (with **file paths**)
   - At least one **worked example**
   - At least three **exercises**
   - A “common mistakes” box

5. **Code:** Include selective real code citations (10–40 lines) from:
   - `backend/app/simulator/radio.py`
   - `backend/app/positioning/multilateration.py`
   - `backend/app/simulator/simulation_engine.py`
   - `frontend/src/hooks/useLiveData.ts`
   - `frontend/src/components/MineMap3D.tsx` (gateway mount / room invert)
   - `config/generate_3d_mine.py` (gateway mesh)

6. **Diagrams:** Reproduce and elaborate all Mermaid diagrams from `docs/architecture.md`, plus new sequence diagrams for: tick loop, alert→burst, gateway offline impact on multilateration.

7. **Output format:** One Markdown file `SMART_MINE_REBUILD_MANUAL.md` suitable for Pandoc → PDF/DOCX. Use `#` / `##` / `###` headings, fenced code, and Mermaid blocks.

8. **Seed material:** Start from and expand `docs/rebuild-handbook/*.md` already in the zip. Do not delete their contracts (coordinate system, MQTT prefix, positioning honesty).

9. **Page-count self-check:** At the end, estimate word count and page count; if under 100 pages, expand Part IV and Part V with more annotated walkthroughs before finishing.

### Optional extras (if space)

- Comparison table: LoRa RSSI vs UWB vs BLE for mines  
- Suggested 8-week university lab schedule  
- Rubric for grading a student rebuild  

Begin by listing the files you inspected from the zip, then write the full manual.

---

## After Claude finishes

1. Save the Markdown.  
2. Convert (example):

```bash
pandoc SMART_MINE_REBUILD_MANUAL.md -o SMART_MINE_REBUILD_MANUAL.pdf --toc --toc-depth=3
```

or open in Word / Google Docs and export PDF.

3. Spot-check 5 random file paths against the repo.
