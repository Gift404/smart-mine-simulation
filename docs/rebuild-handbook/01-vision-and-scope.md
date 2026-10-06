# Chapter 01 — Vision, Scope, and Rebuild Contract

## 1.1 What this system is

The Smart Mine Safety System is a **software simulation of an underground worker-tracking and safety control room**. It models:

- A multi-level mine (surface + four underground levels with shafts and tunnels).
- Wearable devices on miners (vitals, gas, IMU-ish motion, battery).
- LoRa-style radio gateways and path-loss RSSI.
- A positioning pipeline that **never cheats** with ground truth.
- Threshold-based alerts and emergency response jobs.
- A live React control-room dashboard with a 3D WebGL mine map.

The design goal is not “pretty demo only.” It is a **hardware-replaceable architecture**: anything downstream of MQTT (positioning, alerts, jobs, storage, UI) should keep working if real LoRaWAN gateways and ChirpStack replace the simulators.

## 1.2 Problem statement (operational)

Underground mines need continuous awareness of:

1. **Where** each miner is (which level, which drive).
2. **How** they are (SpO₂, heart rate, panic, fall).
3. **What** the atmosphere is doing (CH₄, O₂, airflow) at fixed sensors.
4. **Whether** the radio/backhaul fabric is healthy (gateway online, backhaul up).
5. **What to do** when something is CRITICAL (dispatch a response job).

Rock attenuates RF. GPS does not work. So the industry uses **terrestrial RTLS** (real-time location systems): BLE, Wi-Fi, UWB, or LoRaWAN RSSI / TDoA. This project simulates a **LoRa RSSI multilateration** style approach with tunnel map-matching.

## 1.3 Goals

| Goal | Meaning in this repo |
|------|----------------------|
| Faithful bus | Dashboard consumes MQTT-shaped topics via WebSocket, not private sim APIs for live telemetry |
| Graph-constrained motion | Workers only exist on tunnel/shaft edges |
| Honest positioning | Multilateration inputs = RSSI observations only |
| Configurable safety | Thresholds in JSON, not hardcoded magic numbers |
| Operable demo | Start/pause/speed, scenarios, Systems maintenance page |
| Rebuildable | Clear modules, tests, Docker Compose |

## 1.4 Non-goals (explicit)

- Not a certified SIL-rated safety product.
- Not a full ChirpStack / LoRaWAN stack (topics are simplified).
- Not photorealistic geology or CFD ventilation.
- Not historical Influx **replay** UI (writes may exist; replay is future work).
- Not multi-tenant auth / RBAC (local control-room assumption).

## 1.5 Rebuild contract

If you rebuild from scratch, you **must** preserve these contracts:

### C1 — Coordinate system

- **X** = east (+)/west (−), metres  
- **Y** = elevation (0 = surface, underground negative), metres  
- **Z** = north (+)/south (−), metres  

Frontend Three.js uses Y-up and maps mine coords 1:1.

### C2 — MQTT topic family

Prefix: `mine/section3/`

```
wearable/{tag_id}/telemetry
wearable/{tag_id}/position
wearable/{tag_id}/alert
wearable/{tag_id}/command
gateway/{gw_id}/status
sensor/{sensor_id}/status
job/{job_id}
```

### C3 — Position honesty

`estimate_position(...)` must not accept `true_x`, `true_y`, or `true_z`.  
Regression test: `backend/tests/test_positioning.py`.

### C4 — Config as world seed

Mine geometry, workers, gateways, sensors, thresholds live under `config/` and are loaded at process start.

### C5 — Graceful degradation

If Mosquitto or InfluxDB is down, REST + WebSocket in-process bus must still work.

## 1.6 Deliverables of a full rebuild

1. Backend FastAPI app with sim tick loop.  
2. Positioning + alerts + jobs packages.  
3. Config JSON + generators.  
4. React dashboard with live map.  
5. Docker Compose (Mosquitto, Influx, backend, frontend).  
6. pytest + vitest suites.  
7. Architecture docs and this handbook.

## 1.7 Suggested rebuild phases (summary)

Detailed checklist is Chapter 12. Summary:

1. Empty monorepo + Docker skeleton.  
2. Mine graph + unit tests.  
3. Workers on graph.  
4. Gateways + radio.  
5. Multilateration + map-match.  
6. Alerts + jobs.  
7. FastAPI + MQTT + WS publish.  
8. React bootstrap + WS client.  
9. 3D map.  
10. Systems / Alerts / Risk pages.  
11. Scenarios + polish.

## 1.8 Exercises

1. Write in one paragraph why MQTT sits between sim and UI.  
2. List five things that must stay unchanged when swapping to real gateways.  
3. Open `docs/architecture.md` §7 and redraw the migration diagram from memory.

## 1.9 Chapter checkpoint

You understand **what** you are rebuilding and which contracts are sacred. Proceed to Chapter 02 for RTLS/LoRa theory.
