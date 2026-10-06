# Chapter 11 — Operations Runbook

## 11.1 Healthy system checklist

- [ ] `GET /api/simulation/status` → `running: true`  
- [ ] `gateways_total` matches config (e.g. 85)  
- [ ] Frontend WS connected  
- [ ] Miners move on Live map  
- [ ] MQTT optional: messages on `mine/section3/#`  
- [ ] Influx optional: bucket receiving writes  

## 11.2 Start / stop

**Docker:** `docker compose up --build` / `docker compose down` (`-v` drops Influx volume).

**Local:** uvicorn + `npm run dev`; POST start.

## 11.3 Common failures

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| UI static, status running false | Sim not started | POST `/api/simulation/start` |
| Still 9 gateways | Old backend process | Kill :8000 PIDs; restart |
| Port already in use | Stale uvicorn | Stop OwningProcess of Listen |
| WS fails, REST ok | Proxy/firewall | Check `VITE_WS_URL` |
| Empty map | mine.json failed to load | Check backend logs; `/api/mine` |
| No alerts ever | thresholds / TX | Confirm telemetry topics; thresholds.json |
| 3D black canvas | WebGL / driver | Try another browser; check console |

## 11.4 Changing the world safely

1. Edit or regenerate config.  
2. Restart backend (required for gateway reload).  
3. Hard refresh frontend.  
4. Re-start simulation if needed.

## 11.5 Performance notes

- Many transparent meshes: keep level filter in use on weak GPUs.  
- High speed multipliers increase CPU on tick.  
- MQTT + Influx add I/O; disable if profiling pure sim.

## 11.6 Backup / handoff

Zip for graders or Claude:

- Include: `backend/`, `frontend/`, `config/`, `docs/`, `docker-compose.yml`, `.env.example`, `README.md`  
- Exclude: `node_modules/`, `.venv/`, `__pycache__/`, `dist/`, large `.git` if size-limited  

Use `docs/rebuild-handbook/make_claude_zip.ps1`.

## 11.7 Security note

This is a **local lab system**. Do not expose :8000/:5173 to the public internet without auth, TLS, and hardening.

## 11.8 Exercises

1. Produce a one-page “incident” write-up from logs after a fall scenario.  
2. Measure sim_time advance vs wall clock at speed 5×.  
3. Document your machine’s Python/Node/Docker versions in a `ENV.md`.

## 11.9 Checkpoint

You can operate and recover the stack. Next: **greenfield rebuild checklist**.
