# Smart-LoRa Hybrid Mine Tracking & Safety System — Simulation

A software simulation of an underground LoRaWAN worker-tracking and safety
system: virtual mine, virtual workers, simulated wearables, simulated LoRa
gateways and radio propagation, an RSSI-based positioning pipeline with
map-matching and IMU fusion, a configurable alert engine, a job/response
engine, and a live control-room dashboard — wired together the way real
hardware would be, so the simulator can later be swapped for real LoRaWAN
gear without touching anything downstream of MQTT.

See `docs/architecture.md` for diagrams of the full data flow, positioning
pipeline, alert pipeline, burst-mode sequence, and hardware migration path.

**Full rebuild handbook** (theory → tools → code → checklist):  
`docs/rebuild-handbook/00-README.md`  

To expand into a **100+ page** book with Claude: run  
`docs/rebuild-handbook/make_claude_zip.ps1`, then follow `docs/CLAUDE_BOOK_PROMPT.md`.

## Status

Core simulation, API, dashboard, Docker wiring, zone-gas / backhaul controls,
RSSI-over-time analytics, structured tagged logging, and frontend unit tests
are in place. Historical InfluxDB *replay* (read-back UI) is still a future
enhancement — writes go to Influx when the service is up.

## Done

- Full monorepo structure below.
- Mine tunnel graph (`backend/app/simulator/mine.py`) with map-snapping —
  guarantees a worker/position estimate can never land off valid tunnel
  geometry. Unit-tested.
- 15 workers moving only along the graph, with distinct speeds/behaviors
  (steady/pausing/patrol/turnaround). Unit-tested for 500+ simulated steps.
- 12 simulated gateways + log-distance-path-loss radio simulation
  (`simulator/radio.py`) producing realistic RSSI observations.
- RSSI multilateration (`positioning/multilateration.py`) → map-matching
  (`positioning/map_matching.py`) → confidence scoring → IMU dead-reckoning
  fill-in between radio fixes (`positioning/imu_fusion.py`), wired into the
  live position feed so the dashboard sees smooth movement, not jumps once
  per transmit interval. A dedicated test asserts the multilateration
  function has no code path to ground-truth coordinates.
- Alert engine (`alerts/engine.py`) with config-driven thresholds
  (`config/thresholds.json`), lifecycle (ACTIVE/ACKNOWLEDGED/RESOLVED),
  auto-resolve, and comm-loss detection.
- Job engine (`jobs/engine.py`) dispatches on CRITICAL alerts, including
  severity escalations (WARNING → CRITICAL), with de-duplication.
- Fall/panic scenarios: fall freezes movement and raises an immediate
  CRITICAL alert; panic raises CRITICAL without freezing movement; `clear`
  resumes movement and resolves the alert. Unit-tested.
- Zone-wide methane gas events (`POST /api/simulation/zone-gas/{zone_id}`)
  and gateway backhaul failure / restore (`POST /api/simulation/backhaul/{id}`)
  with dashboard controls.
- FastAPI backend (`backend/app/main.py`) with the REST API, `/api/mine` for
  the dashboard, WebSocket bridge at `/ws/live`, and graceful fallback when
  Mosquitto/InfluxDB aren't reachable.
- Structured `[SIMULATOR]` / `[RADIO]` / `[POSITION]` / `[ALERT]` /
  `[WEARABLE]` / `[JOB]` / `[MQTT]` / `[INFLUX]` logging.
- Backend pytest suite (`cd backend && PYTHONPATH=. pytest tests/ -v`).
- React/TypeScript/Vite/Tailwind dashboard (`frontend/`): control-room
  layout (responsive), SVG mine map, telemetry panel, alert feed, gateway
  status, jobs, simulation controls (including zone gas + backhaul), and
  analytics with live sparklines including **best RSSI over time**.
- Frontend vitest unit tests (`cd frontend && npm test`).

## Known limitations / follow-ups

- **IMU heading** after a radio fix still assumes forward direction on the
  snapped edge (documented in `docs/architecture.md`).
- **Historical replay** of InfluxDB data is not implemented yet (writes only).
- Docker Compose should be verified on the host with `docker compose up --build`
  if it has not been run in this environment yet.

## Folder structure

```
smart-mine-simulation/
├── backend/            FastAPI app: simulator, positioning, alerts, jobs, MQTT, DB, WebSocket
│   ├── app/
│   └── tests/
├── frontend/           React + TypeScript + Vite + Tailwind control-room dashboard
├── config/             mine.json, workers.json, gateways.json, thresholds.json, mosquitto.conf
├── docs/architecture.md
├── docker-compose.yml
└── .env.example
```

## How to start

```bash
cp .env.example .env
docker compose up --build
```

- Backend API: http://localhost:8000 (interactive docs at `/docs`)
- Dashboard: http://localhost:5173
- MQTT broker: localhost:1883
- InfluxDB UI: http://localhost:8086

For backend-only local development without Docker:

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The backend degrades gracefully if Mosquitto/InfluxDB aren't running — it
logs a warning and keeps serving the REST API and WebSocket feed off an
in-process bus.

For frontend-only local development:

```bash
cd frontend
npm install
npm run dev
```

## How to stop

```bash
docker compose down
```

Add `-v` to also drop the InfluxDB volume.

## How to run tests

```bash
cd backend
PYTHONPATH=. pytest tests/ -v
```

```bash
cd frontend
npm install
npm test
```

## How MQTT works

One `MqttBus` wrapper (`backend/app/mqtt/client.py`) is the only thing that
ever talks to the broker. Every other service publishes/subscribes through
it. Topics (`backend/app/mqtt/topics.py`):

```
mine/section3/wearable/{tag_id}/telemetry
mine/section3/wearable/{tag_id}/position
mine/section3/wearable/{tag_id}/alert
mine/section3/wearable/{tag_id}/command   (BURST_ON / BURST_OFF)
mine/section3/gateway/{gw_id}/status
mine/section3/job/{job_id}
```

## How simulated LoRa works

`backend/app/simulator/radio.py` uses a log-distance path-loss model
(`RSSI = ref_rssi_at_1m - 10 * n * log10(distance) + noise`) to decide, per
gateway, whether a transmission is heard and what RSSI it produces. Only
`(tag_id, gateway_id, rssi, ts)` tuples ever leave this layer — never the
worker's true coordinates.

## How positioning works

RSSI observations → weighted trilateration → map-snap onto the tunnel
graph → confidence scoring → IMU dead-reckoning fill-in between radio
fixes. See `docs/architecture.md` for the diagram and
`backend/app/positioning/` for the code.

## How alerts work

Thresholds live in `config/thresholds.json` — never hard-coded in
application logic. `backend/app/alerts/engine.py` evaluates each telemetry
payload, creates/escalates/auto-resolves alerts, and tracks comm-loss
timeouts. CRITICAL alerts (including immediate ones like fall and
panic-button) trigger a dispatched job and switch the worker's wearable
into BURST mode.

## How to trigger scenarios

Via the dashboard's Simulation Control panel, or directly:

```bash
curl -X POST http://localhost:8000/api/simulation/start
curl -X POST http://localhost:8000/api/simulation/trigger/low_spo2/W07
curl -X POST http://localhost:8000/api/simulation/trigger/fall/W04
curl -X POST http://localhost:8000/api/simulation/trigger/clear/W07
curl -X POST "http://localhost:8000/api/simulation/zone-gas/ZONE_A?value=30"
curl -X POST "http://localhost:8000/api/simulation/backhaul/GW01?failed=true"
curl -X POST "http://localhost:8000/api/simulation/backhaul/GW01?failed=false"
```

Supported per-worker scenarios: `low_spo2`, `high_hr`, `low_o2`, `methane`,
`fall`, `panic`, `clear`.

## How real hardware can eventually replace the simulator

`simulator/mine.py`, `simulator/workers.py`, `simulator/wearable.py`,
`simulator/gateways.py`, and `simulator/radio.py` are the only pieces that
know they're simulated. They all funnel into the same MQTT topic contracts
a real ChirpStack + LoRaWAN gateway deployment would use. Replacing them
means writing a `LoRaTelemetrySource` / `RealGatewaySource` that publishes
to the same topics — `positioning/`, `alerts/`, `jobs/`, `database/`, and
the dashboard need no changes at all.
