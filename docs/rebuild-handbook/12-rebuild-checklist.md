# Chapter 12 — Greenfield Rebuild Checklist

Use this when rebuilding the system in a **new empty repository**. Check items only when tests or manual verification pass.

## Phase A — Skeleton

- [ ] Create monorepo folders: `backend/app`, `frontend/src`, `config`, `docs`  
- [ ] Add `docker-compose.yml` with mosquitto, influx, backend, frontend stubs  
- [ ] Add `.env.example`  
- [ ] Backend FastAPI hello `/api/health`  
- [ ] Frontend Vite React hello page  

## Phase B — World model

- [ ] Author or generate `mine.json` with levels + nodes + edges  
- [ ] `MineGraph` loads JSON; unit test snap on a known edge  
- [ ] `workers.json` + workers move 100 ticks on-graph  
- [ ] `gateways.json` + `sensors.json` + `thresholds.json`  

## Phase C — Radio honesty

- [ ] Radio emits RSSI observations only  
- [ ] Multilateration has **no** true position parameters (test)  
- [ ] Map match never returns off-graph points  
- [ ] Publish position MQTT/WS payloads  

## Phase D — Safety

- [ ] Alert engine warn/crit + lifecycle  
- [ ] Comm-loss  
- [ ] Fall/panic scenarios  
- [ ] Job dispatch on CRITICAL with dedupe  
- [ ] BURST_ON/OFF commands  

## Phase E — Integration spine

- [ ] `SimulationEngine.tick` end-to-end  
- [ ] `publish()` → MQTT + WS (+ Influx optional)  
- [ ] REST list/status/control endpoints  
- [ ] Graceful MQTT/Influx failure  

## Phase F — Control room

- [ ] `useLiveData` bootstrap + WS  
- [ ] Live map (2D acceptable first; then MineMap3D)  
- [ ] Alerts page with names  
- [ ] Systems page gateway/sensor actions  
- [ ] Miners / Analytics / Risk  

## Phase G — Hardening

- [ ] pytest green  
- [ ] vitest green  
- [ ] README quick start  
- [ ] `docs/architecture.md` diagrams  
- [ ] This handbook linked from README  

## Phase H — Acceptance demo (15 min)

- [ ] Compose or local stack up  
- [ ] 3D map shows multi-level mine + miners  
- [ ] Trigger fall → alert → job → ack  
- [ ] Toggle gateway offline  
- [ ] Explain MQTT boundary aloud to a peer  

## Definition of done

A peer who only read Chapters 01–04 and this checklist can run the demo and correctly answer: *“Where does ground truth stop?”* → **at the radio simulator.**
