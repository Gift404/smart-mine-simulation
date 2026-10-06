# Revert to pre-Platreef system

A full snapshot lives at:

`backups/pre-platreef-2026-10-06/`

Git branch (same snapshot commit): `backup/pre-platreef-2026-10-06`

## Tell the agent

> **revert**  
> or **revert to pre-platreef**

## Manual restore (PowerShell, repo root)

```powershell
Copy-Item -Recurse -Force backups\pre-platreef-2026-10-06\config\* config\
Copy-Item -Recurse -Force backups\pre-platreef-2026-10-06\backend\app\* backend\app\
Copy-Item -Recurse -Force backups\pre-platreef-2026-10-06\frontend\src\* frontend\src\
```

Then restart the backend (port 8000) and frontend (port 5173).

## Current world

The live configs are a **Platreef-inspired** reconstruction (Mokopane, Limpopo) from public IDP/FS descriptions — Shafts 1–5, 750/850/950/1050 m levels, Shaft 3 tips/crusher/conveyor, ramps, ore passes. Not a proprietary surveyed plan.
