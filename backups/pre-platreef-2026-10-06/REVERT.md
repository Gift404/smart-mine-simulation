# Revert snapshot — pre-Platreef layout

Created: 2026-10-06

This folder freezes the simulation **before** the Platreef-inspired rebuild.

## How to revert

Tell the agent: **revert** or **revert to pre-platreef**

Or manually (PowerShell from repo root):

```powershell
Copy-Item -Recurse -Force backups\pre-platreef-2026-10-06\config\* config\
Copy-Item -Recurse -Force backups\pre-platreef-2026-10-06\backend\app\* backend\app\
Copy-Item -Recurse -Force backups\pre-platreef-2026-10-06\frontend\src\* frontend\src\
```

Then restart backend (port 8000) and frontend (port 5173).

## What is saved
- config/ (mine, workers, gateways, sensors, vehicles, generators)
- backend/app/ and frontend/src/ as of the snapshot moment
