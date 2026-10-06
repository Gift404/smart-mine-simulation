# Chapter 07 — Backend Rebuild Guide

## 7.1 Rebuild order (backend-only)

1. Models (`app/models/*`) — Worker, Gateway, Telemetry, Alert, Job, Sensor, RssiObservation  
2. `MineGraph` load + `point_on_edge` / `snap_point`  
3. `WorkerSimulator` motion on edges  
4. `GatewaySimulator` + `RadioSimulator`  
5. `estimate_position` + `snap_to_graph`  
6. `AlertEngine` + `JobEngine`  
7. `SimulationEngine` orchestration  
8. `main.py` REST + WS + tick + `publish`  
9. MQTT + Influx adapters  
10. Scenarios + Systems mutation endpoints  
11. pytest suite  

## 7.2 Mine graph (`simulator/mine.py`)

Load `mine.json`. Provide:

- `nodes`, `edges` dictionaries  
- Geometry helpers: position along edge, nearest edge snap  
- Level/zone metadata lookups  

**Invariant:** snapped points lie on an edge segment.

## 7.3 Workers (`simulator/workers.py`)

State per worker includes edge_id, distance_along, speed, behavior, true x/y/z, nearest_gateway, alarm flags.

Each `step(dt)`:

1. Advance along edge by `speed * dt * multiplier` (engine applies speed).  
2. At node, choose next edge per behavior.  
3. Shaft riders prefer vertical edges when appropriate.  
4. Fall scenario can freeze motion.

## 7.4 Wearable (`simulator/wearable.py`)

Produces telemetry samples: vitals + environmental channels + battery. Scenarios override targets (low SpO₂, high HR, methane spike). Burst mode shortens TX interval tracked by the engine.

## 7.5 Gateways & radio

`gateways.py` — dict of Gateway models; online/offline; backhaul flags.  
`radio.py` — for each online GW in coverage, emit `RssiObservation(tag_id, gateway_id, rssi, ts)`.

**Do not** attach true XYZ to observations.

## 7.6 Positioning package

| Module | Function |
|--------|----------|
| `multilateration.py` | RSSI → (x,y,z) estimate |
| `map_matching.py` | Snap + confidence |
| `imu_fusion.py` | Between-fix fill |

Wire inside `_transmit_and_process` after radio.

## 7.7 Alerts (`alerts/engine.py`)

Evaluate telemetry vs thresholds. Manage lifecycle ACTIVE → ACK → RESOLVED. Comm-loss if no telemetry within timeout. Fall/panic bypass thresholds as immediate CRITICAL.

## 7.8 Jobs (`jobs/engine.py`)

On new/escalated CRITICAL, create job with title/location/priority. Deduplicate so one fall does not spawn infinite jobs.

## 7.9 SimulationEngine tick (pseudocode)

```
def tick(dt):
    if not running: return
    sim_time += dt
    for worker in workers:
        worker_sim.step(worker, dt)
        publish continuous track position
        if due_for_tx(worker):
            telemetry = wearable.sample(worker)
            publish telemetry
            obs = radio.transmit(...)
            publish gateway rssi reports as needed
            raw = estimate_position(obs, ...)
            if raw: snap = snap_to_graph(...); publish position
            alerts = alert_engine.evaluate(...)
            publish alerts; maybe jobs; maybe BURST commands
    sensors.update(...)
```

## 7.10 FastAPI surface (`main.py`)

Essential routes to re-implement:

- GET health, mine, workers, gateways, sensors, alerts, jobs, simulation/status  
- POST simulation/start|pause|reset, speed, trigger scenarios, zone-gas, backhaul, gateway offline, sensor fault, alert ack  
- WS `/ws/live`

Lifespan: connect MQTT, start asyncio loop calling `engine.tick`.

## 7.11 Logging

Use tagged loggers so classroom debugging is greppable:

`[SIMULATOR] [RADIO] [POSITION] [ALERT] [JOB] [MQTT] [INFLUX] [WEARABLE] [SENSORS] [MAIN]`

## 7.12 Common rebuild mistakes

1. Passing true coordinates into multilateration.  
2. Forgetting to republish gateway status when toggling offline.  
3. Blocking the event loop with heavy numpy inside async without `to_thread`.  
4. Reloading uvicorn but not noticing an old process still bound to :8000.  
5. Editing JSON while container has stale mount cache (rare) — restart backend.

## 7.13 Exercises

1. Trace one TX from `wearable.sample` to WS payload keys.  
2. Add a log line counting `len(obs)` per TX; watch it while walking near a dense mesh.  
3. Write a failing test if `estimate_position` signature gains `true_x`.

## 7.14 Checkpoint

Backend loop is rebuildable. Next: **frontend**.
