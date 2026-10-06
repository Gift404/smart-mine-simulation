---
title: "Smart Mine Safety System — Rebuild Handbook (Seed Volume)"
subtitle: "Concatenate of docs/rebuild-handbook — expand via CLAUDE_BOOK_PROMPT.md for 100+ pages"
---

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


---

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


---

# Chapter 02 — Theory: Underground RTLS and LoRa-Style Tracking

## 2.1 Why GPS fails underground

Satellite GNSS signals are ~−130 dBm at the surface and do not penetrate rock meaningfully. Underground location therefore needs **infrastructure beacons** (gateways / APs / anchors) whose positions are surveyed in the mine coordinate frame.

## 2.2 Classes of underground location tech

| Technology | Typical accuracy | Power / range | Notes |
|------------|------------------|---------------|-------|
| RFID portals | Zone / choke-point | High reliability at gates | Coarse |
| Wi-Fi RSSI / RTT | 5–30 m | Power hungry tags | Needs dense APs |
| BLE beacons | 3–15 m | Low power | Dense mesh |
| UWB | 0.1–1 m | Short range, costly | Best accuracy |
| LoRaWAN RSSI | 20–100+ m | Long range, low rate | Good for sparse mines |
| LoRaWAN TDoA | Better than RSSI | Needs synced gateways | Not simulated here |

This project approximates **LoRa RSSI ranging + multilateration + map constraints**.

## 2.3 What a “gateway” is here

In the UI they look like wall-mounted radio units. Functionally a gateway is:

1. A **known coordinate** `(x, y, z)` in the mine frame.  
2. An **online/offline** status.  
3. Optional **backhaul** primary/fallback (fibre/radio uplink).  
4. A participant in **path-loss ranging**: when a wearable transmits, each gateway in coverage reports an RSSI.

Coverage is limited by `coverage_radius_m` (config; currently ~95 m) with mild random effective-radius jitter in the radio sim.

## 2.4 Wearable / tag role

Each miner has a wearable that periodically transmits:

- Identity (`tag_id` / `worker_id`)
- Telemetry: SpO₂, HR, ambient O₂/CH₄, battery, motion flags
- Implicitly: “I am somewhere in space” — but **not** GPS coordinates

The network sees **signal strength at gateways**, not a self-reported XYZ (except the sim’s separate continuous track used only for smooth UI, published as a distinct method).

## 2.5 Transmit intervals and burst mode

Normal interval (config-driven, historically ~5–20 s) saves battery.  
When a worker is in alarm, the system commands **BURST_ON**: faster transmit (~1.5–2 s) so positions and vitals refresh quickly for responders.

Theory: emergency UX trades battery for freshness. Implementation: alert engine → simulation engine publishes command topic → wearable mode flips.

## 2.6 Tunnel graph as a map prior

Rock is solid. A raw multilateration fix can land inside solid rock. **Map matching** projects the estimate onto the nearest point of the **tunnel graph** (nodes + edges). That is a Bayesian-style prior: “location must lie on traversable geometry.”

Workers’ **true** motion also respects the graph: they walk along edges with `distance_along` parameterization.

## 2.7 Multi-level mines and 3D ranging

Levels sit at different elevations (e.g. −100, −250, −400, −550 m). Distance is **3D Euclidean**:

\[
d = \sqrt{(x_t-x_g)^2 + (y_t-y_g)^2 + (z_t-z_g)^2}
\]

A gateway on L1 can still hear a tag on L2 if vertical separation is within coverage — but RSSI will be weaker. Dense **per-level** mesh + mid-shaft gateways make multilateration well-conditioned.

## 2.8 Why gateway density matters

Multilateration needs **≥3** gateways (≥4 preferred for full 3D). Geometry matters:

- Collinear gateways → poor dilution of precision (DOP).  
- Spread around the miner → better fix.  
- Too sparse → `estimate_position` returns `None`.

This repo’s generator places ~85 gateways (~55 m spacing) so typical miners hear several APs.

## 2.9 Safety layering (theory of alerts)

Location alone is not safety. Combine:

1. **Physiological** thresholds (SpO₂, HR).  
2. **Atmospheric** (CH₄, O₂) from wearable and fixed sensors.  
3. **Event** channels (fall detection, panic button).  
4. **Communications** health (comm-loss timeout).  
5. **Workflow** (CRITICAL → job for humans).

## 2.10 Control-room UX principles (as built)

- Live map is primary situational awareness.  
- Alerts list is the incident queue.  
- Systems page is infrastructure maintenance (gateways/sensors).  
- Risk page aggregates zone-level heat (client-side in this project).  
- Track mode locks camera on a miner for response.

## 2.11 Exercises

1. Compare LoRa RSSI vs UWB for a refuge chamber use case (accuracy vs cost).  
2. Explain in two sentences how map matching improves safety of displayed position.  
3. If coverage radius is 95 m and spacing is 55 m, roughly how many gateways might hear a miner in a straight drive? (Order-of-magnitude.)

## 2.12 Checkpoint

You can explain the physical problem RTLS solves underground and how this project’s abstractions map to that problem. Next: **positioning mathematics**.


---

# Chapter 03 — Theory: Path Loss, Multilateration, Map Matching

## 3.1 Log-distance path-loss model

Received signal strength (RSSI) decreases with distance. A common empirical model:

\[
\text{RSSI}(d) = \text{RSSI}_{1\text{m}} - 10\,n\,\log_{10}(d) + \mathcal{N}(0,\sigma^2)
\]

Where:

- \(\text{RSSI}_{1\text{m}}\) = reference at 1 metre (`reference_rssi_at_1m`, e.g. −40 dBm)
- \(n\) = path-loss exponent (`path_loss_exponent`, e.g. 2.8; free space ≈ 2, tunnels/rock higher)
- \(\sigma\) = noise std (`noise_std_db`, e.g. 4 dB)
- \(d\) = 3D distance in metres

**Implementation:** `backend/app/simulator/radio.py`.

### Invert for ranging

Solve for distance given observed RSSI:

\[
d = 10^{\,(\text{RSSI}_{1\text{m}} - \text{RSSI})/(10 n)}
\]

**Implementation:** `rssi_to_distance` in `positioning/multilateration.py`.

Caveats: multipath, body shadowing, and antenna orientation make \(d\) noisy. That is why map matching and multiple gateways exist.

## 3.2 From ranges to position (multilateration)

Each gateway \(i\) at known \((x_i,y_i,z_i)\) yields range estimate \(r_i\). Ideal equations:

\[
(x-x_i)^2 + (y-y_i)^2 + (z-z_i)^2 = r_i^2
\]

Subtracting gateway 1’s equation linearizes to a least-squares system \(A\mathbf{p}=\mathbf{b}\) in unknowns \((x,y,z)\).

### This repo’s rules

| # observations | Solver |
|----------------|--------|
| &lt; 3 | No estimate (`None`) |
| 3 | Solve **XZ**, hold **Y** at strongest gateway’s elevation |
| ≥ 4 | Full **3D** least squares (use top 5 by RSSI) |

Code: `_lstsq_3d`, `_lstsq_xz_fixed_y`.

### Worked micro-example (2D intuition)

Gateways at (0,0) and (100,0) with ranges 60 and 60 intersect at roughly (50, ±√(60²−50²)). Third gateway disambiguates the side. Noise moves the intersection; LS finds a compromise.

## 3.3 Map matching / snap-to-graph

After raw \((x,y,z)\):

1. Enumerate mine edges (tunnels, shafts, ramps).  
2. Find closest point on any edge segment in 3D.  
3. Report snapped coordinates + `edge_id` + along-edge distance + residual error.  
4. Score confidence from: number of gateways, average RSSI, snap residual.

**Implementation:** `positioning/map_matching.py` (`snap_to_graph`, `confidence_score`).

Guarantee: displayed radio fix lies on traversable geometry (within numerical tolerance).

## 3.4 IMU / dead-reckoning fusion

Radio fixes arrive only on transmit intervals. Between fixes, fuse last snapped pose with simulated displacement (proxy for IMU) so the UI moves smoothly. Confidence decays until the next real fix.

**Implementation:** `positioning/imu_fusion.py`.  
**Limitation (documented):** heading after a fix often assumes forward along the snapped edge.

## 3.5 Continuous track vs radio fix (critical distinction)

| Method | Source | Purpose |
|--------|--------|---------|
| `CONTINUOUS_TRACK` (name may vary in payload) | Simulator true pose each tick | Smooth markers for operators |
| `RSSI_MULTILATERATION` | RSSI-only pipeline | Honest RTLS estimate |

When teaching or auditing, **never** confuse the smooth track with “what LoRa knows.” Hardware migration keeps the RSSI path; continuous track would disappear or become vehicle odometry.

## 3.6 Dilution of precision (conceptual)

If all hearing gateways lie on a line (long straight drive), depth across the tunnel is poorly observed. Remedies: place gateways on branches, loops, and at elevations (shafts). The mesh generator intentionally hits junctions and rooms.

## 3.7 Confidence labels

Typical mapping (see code for exact formula):

- **HIGH** — many gateways, strong RSSI, small snap error  
- **MEDIUM** — mixed  
- **LOW** — few gateways or large snap residual  

UI can dim or annotate low-confidence tracks.

## 3.8 Exercises

1. Given RSSI_1m = −40, n = 2.8, RSSI = −80, compute \(d\).  
2. Why does 3-gateway mode freeze Y instead of solving full 3D?  
3. Sketch why snap residual rising suddenly might mean a bad radio geometry or wrong level.

## 3.9 Checkpoint

You can derive RSSI→distance→LS position→snap. Next: **system architecture boxes and buses**.


---

# Chapter 04 — System Architecture

## 4.1 Monorepo layout

```
smart-mine-simulation/
├── backend/                 # FastAPI + simulation + positioning + alerts
│   ├── app/
│   │   ├── main.py          # Entry: REST, WS, tick loop, publish()
│   │   ├── config.py        # Paths to ../config
│   │   ├── simulator/       # Mine, workers, radio, gateways, sensors, scenarios
│   │   ├── positioning/     # Multilateration, map-match, IMU fusion
│   │   ├── alerts/          # Threshold engine
│   │   ├── jobs/            # CRITICAL → response jobs
│   │   ├── mqtt/            # Broker client + topic helpers
│   │   ├── websocket/       # Fan-out to browsers
│   │   ├── database/        # Influx writes
│   │   └── models/          # Pydantic models
│   └── tests/
├── frontend/                # React + Vite + Tailwind + R3F
│   └── src/
│       ├── pages/           # Live map, alerts, miners, systems, analytics, risk
│       ├── components/      # MineMap3D, panels, feeds
│       ├── hooks/           # useLiveData
│       ├── context/         # LiveDataProvider
│       └── services/        # api, websocket, riskEngine, status
├── config/                  # World seed JSON + mosquitto + generators
├── docs/                    # architecture.md + this handbook
├── docker-compose.yml
└── README.md
```

## 4.2 Runtime component diagram

```
┌─────────────┐   tick    ┌──────────────────┐
│  uvicorn    │ ────────► │ SimulationEngine │
│  main.py    │           └────────┬─────────┘
└──────┬──────┘                    │
       │ publish(topic,payload)    │ ground truth stays inside sim
       ▼                           ▼
┌──────────────┐            ┌─────────────┐
│ MQTT broker  │◄───────────│ Radio RSSI  │
│ (optional)   │            └─────────────┘
└──────┬───────┘
       │
       ├──────────────► Positioning (RSSI only)
       ├──────────────► Alert / Job engines
       ├──────────────► InfluxDB (optional)
       └──────────────► WebSocket /ws/live ──► React dashboard
```

**Golden rule:** the dashboard does not call `WorkerSimulator` internals for live vitals/positions. It consumes the same topic stream a real integration would.

## 4.3 SimulationEngine responsibilities

File: `backend/app/simulator/simulation_engine.py`

1. Construct subsystems from config paths.  
2. `tick(dt)`: advance time, move workers, maybe transmit, process RSSI, alerts, sensors.  
3. Expose mutation APIs used by REST (scenarios, backhaul, offline, ack).  
4. Track `running`, `sim_time_s`, `speed_multiplier`.

## 4.4 Publish fan-out

`main.publish(topic, payload)` typically:

1. MQTT publish (if connected).  
2. WebSocket broadcast `{topic, payload}`.  
3. Conditional Influx write (telemetry / position).

This single function is the **integration spine**. Rebuild it early and keep it boring.

## 4.5 Frontend live architecture

```
LiveDataProvider
    └── useLiveData
            ├── REST bootstrap (mine, workers, gateways, sensors, alerts, jobs, status)
            ├── WS connect → merge by topic
            └── poll status every few seconds
Pages/Components subscribe via useLive()
```

Selection/tracking IDs live in context so map, search, and alerts share focus.

## 4.6 Migration seam (hardware)

Replaceable (simulation side):

- Wearable telemetry generator  
- Radio path-loss model  
- Gateway online simulation  

Stable (downstream):

- MQTT topic schemas  
- Multilateration + map-match  
- Alerts + jobs  
- Influx schema  
- Dashboard

See `docs/architecture.md` §7.

## 4.7 Cross-cutting concerns

| Concern | Approach in repo |
|---------|------------------|
| Logging | Tagged loggers `[SIMULATOR] [RADIO] [POSITION] …` |
| Time | Simulated time `sim_time_s` separate from wall clock |
| Speed | Multiplier accelerates dt integration |
| Idempotent jobs | Job engine dedupes active CRITICAL per worker/type |
| Demo seed | Optional criticals on start for classroom demos |

## 4.8 Exercises

1. Draw arrows from `radio.transmit` to the React miner sphere without skipping MQTT/WS.  
2. Name three modules that must not import `Worker.x` true position for “estimates.”  
3. Find `publish` in `main.py` and list its callees/side effects.

## 4.9 Checkpoint

Architecture boxes are clear. Next: **tools and environment** to rebuild locally.


---

# Chapter 05 — Tools and Environment

## 5.1 Required toolchain

| Tool | Version guidance | Role |
|------|------------------|------|
| Python | 3.9+ (repo verified on 3.9) | Backend |
| Node.js | 18+ LTS recommended | Frontend tooling |
| npm | Comes with Node | Install Vite/React |
| Docker Desktop / Compose | Optional but recommended | Full stack |
| Git | Any recent | Version control |
| Editor | Cursor / VS Code | Dev |

### Python packages (`backend/requirements.txt`)

- `fastapi`, `uvicorn[standard]`, `pydantic`
- `numpy` — multilateration LS
- `paho-mqtt` — broker client
- `influxdb-client` — optional time-series writes
- `pytest`, `httpx` — tests

### Frontend packages (`frontend/package.json`)

- `react`, `react-dom`, `react-router-dom`
- `vite`, `typescript`, `tailwindcss`
- `three`, `@react-three/fiber`, `@react-three/drei` — 3D map
- `vitest` — unit tests

## 5.2 Environment variables

Copy `.env.example` → `.env`. Typical keys:

| Variable | Purpose |
|----------|---------|
| `MQTT_HOST` / `MQTT_PORT` | Broker address |
| `INFLUX_URL` / `TOKEN` / `ORG` / `BUCKET` | Time-series |
| `VITE_API_URL` | Frontend → REST |
| `VITE_WS_URL` | Frontend → WS |

Backend also uses tick rate settings via config/env (see `app/config.py`).

## 5.3 Running without Docker

### Backend

```bash
cd backend
pip install -r requirements.txt
set PYTHONPATH=.          # Windows cmd
# or: $env:PYTHONPATH = "."  # PowerShell
py -3.9 -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

If Mosquitto/Influx are absent, logs warn; REST + WS still work.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173/

### Start simulation

Live map often auto-starts. Or:

```bash
curl -X POST http://127.0.0.1:8000/api/simulation/start
```

## 5.4 Running with Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

Services: Mosquitto `:1883`, Influx `:8086`, backend `:8000`, frontend `:5173`.

Config is mounted read-only into the backend container (`./config:/app/config:ro`).

## 5.5 Regenerating the mine world

```bash
python config/generate_3d_mine.py
```

Rewrites `mine.json`, `gateways.json`, `workers.json`, `sensors.json`.  
**Restart backend** afterward so `GatewaySimulator` reloads.

## 5.6 API documentation

FastAPI Swagger UI: http://127.0.0.1:8000/docs

## 5.7 Recommended Windows notes

- Prefer `py -3.9` if multiple Pythons installed.  
- Kill stale `:8000` listeners before restart (`Get-NetTCPConnection -LocalPort 8000`).  
- PowerShell execution policy may block scripts; run `make_claude_zip.ps1` with bypass if needed.

## 5.8 IDE setup tips

- Open repo root as workspace.  
- Python interpreter → env with requirements installed.  
- ESLint optional; Tailwind via PostCSS already wired.  
- Keep handbook + architecture.md in the sidebar while coding.

## 5.9 Exercises

1. Start backend only; hit `/api/health` and `/api/gateways` count.  
2. Start frontend; confirm WS connects (browser Network tab).  
3. Run `pytest` and `npm test`; note any failures before you change code.

## 5.10 Checkpoint

Your machine can run the stack. Next: **config world model**.


---

# Chapter 06 — Config and World Model

## 6.1 Philosophy

**Config is the mine.** Code interprets JSON; generators create JSON. Changing layout should not require editing Python/TS business logic.

Loader: `backend/app/config.py` resolves `CONFIG_DIR` to repo `config/` (or `/app/config` in Docker).

## 6.2 `mine.json`

Top-level fields (conceptual):

| Field | Meaning |
|-------|---------|
| `name`, `blueprint` | Metadata |
| `coordinate_system` | Documents X/Y/Z meaning |
| `levels[]` | SURFACE, L1…L4 with `depth_m` |
| `nodes[]` | Graph vertices: id, x,y,z, type, level_id |
| `edges[]` | Segments: start, end, length, zone_id, kind |
| `zones` | Derived zone id list |
| `gateway_locations` | Mirror of gateway poses (also in gateways.json) |
| `portals` | Optional special links |

### Node types (examples)

`surface`, `lift_station`, `intersection`, `refuge`, `workshop`, `emergency`, `work_zone`, `vent_station`, `escape_station`

### Edge kinds

`tunnel` (horizontal drives), `shaft` / `vent_shaft` / `escape_shaft`, `ramp`

Workers move only along edges. Facility rooms in the 3D UI are rendered at facility node types.

## 6.3 `workers.json`

Each worker:

```json
{
  "worker_id": "W04",
  "name": "Naledi",
  "role": "Mechanic",
  "wearable_id": "WD-W04",
  "start_edge": "L2_spine_0",
  "walking_speed_mps": 1.15,
  "behavior_profile": "steady"
}
```

Profiles drive motion AI: `steady`, `patrol`, `shaft_rider`, etc.

## 6.4 `gateways.json`

Radio physics + list:

```json
{
  "coverage_radius_m": 95,
  "path_loss_exponent": 2.8,
  "reference_rssi_at_1m": -40,
  "noise_std_db": 4.0,
  "gateways": [ { "gateway_id", "name", "x", "y", "z", "zone_id", "level_id", "depth_m" } ]
}
```

Dense mesh (~85 units) is produced by `generate_3d_mine.py` (`place_gateway_mesh`).

## 6.5 `sensors.json`

Fixed environmental sensors: CH₄, O₂, AIRFLOW (and optionally TEMP). Each has pose, unit, `linked_gateway_id`, battery/maintenance fields for Systems page.

## 6.6 `thresholds.json`

Defines warn/crit cutovers for vitals and gases, `comm_loss_timeout_s`, and burst/normal transmit intervals. **Tune safety behaviour here**, not in scattered constants.

## 6.7 Generator: `generate_3d_mine.py`

Responsibilities:

1. Build shaft columns (main/vent/escape) through levels.  
2. Build unique horizontal footprints per level (blueprint-inspired).  
3. Add decline ramp L2↔L3.  
4. Place workers on named edges.  
5. Place dense gateway mesh + sensors linked to nearest GW.  
6. Write JSON files.

Rebuild rule: run generator → restart API → hard-refresh UI.

## 6.8 Consistency rules when editing by hand

1. Every `start_edge` / `end` node id must exist.  
2. Edge `length` should match Euclidean distance of endpoints.  
3. Gateway `level_id` should match elevation.  
4. Sensor `linked_gateway_id` must exist in gateways.json.  
5. Zone ids referenced by alerts/UI should appear on edges.

## 6.9 Exercises

1. Find LIFT node on L3; list connected edge ids.  
2. Change one gateway coordinate by 10 m; predict map marker shift.  
3. Add a fictional gateway to JSON; restart; confirm Systems list count +1.

## 6.10 Checkpoint

You can seed and mutate the world safely. Next: **backend rebuild deep dive**.


---

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


---

# Chapter 08 — Frontend Rebuild Guide

## 8.1 Stack choices

- **Vite + React 18 + TypeScript** — fast DX  
- **Tailwind** — control-room density  
- **React Router** — pages  
- **Three.js + React Three Fiber + Drei** — 3D mine  

## 8.2 App shell

`App.tsx` wraps routes in `LiveDataProvider` and an `AppShell` (nav: Live, Alerts, Miners, Systems, Analytics, Risk).

## 8.3 Live data hook

`hooks/useLiveData.ts` responsibilities:

1. On mount: REST fetch mine/workers/gateways/sensors/alerts/jobs/status into maps keyed by id.  
2. Open WebSocket; on message, branch by topic substring.  
3. Update `telemetryByTag`, `positionByTag` (also patch worker x/y/z for markers), alerts, jobs, gateway RSSI buffers, sensors.  
4. Poll `/api/simulation/status` as a safety net.

**Rebuild tip:** keep a single reducer-like `setState` pattern; avoid prop-drilling through five layouts.

## 8.4 Types

`types/index.ts` must stay aligned with backend models (Worker, Gateway, Alert, MineGraph, Telemetry, PositionEstimate, Job, MineSensor).

## 8.5 Pages to rebuild

| Route | Page | Focus |
|-------|------|-------|
| `/` | LiveMapPage | Map + side panels; auto-start sim |
| `/alerts` | AlertsPage | Filter, ack, show `id · name` |
| `/miners` | MinersPage | Roster |
| `/systems` | SystemsPage | Gateways/sensors maintenance |
| `/analytics` | AnalyticsPage | Sparklines / RSSI |
| `/risk` | RiskPage | Zone risk from `riskEngine.ts` |

## 8.6 MineMap3D rebuild notes

File: `components/MineMap3D.tsx`

### Geometry

- Tunnel segments: open-ended cylinders between nodes; junction spheres at corners.  
- Shafts: larger radius / distinct colours.  
- Facility rooms: floor on tunnel invert (`y = -TUNNEL_RADIUS`), open doorway facing feed direction.  
- Gateways: flat wall panels aligned to nearest tunnel (not glowing spheres).  
- Workers: coloured spheres + Html labels; tracking beacon when followed.

### Interaction

- OrbitControls; TrackingCamera lerps target to tracked miner.  
- Click miner → select + track.  
- Level filter adjusts opacity per `level_id`.  
- Raycast null on decorative meshes so clicks hit workers.

### Performance

Dozens of transparent tubes + ~85 gateways: keep materials cheap (`depthWrite: false` on glass), avoid per-frame allocations in `useFrame`.

## 8.7 Status colours

`services/status.ts` maps worker alert state → OK / WARNING / CRITICAL colours used on map and cards.

## 8.8 Risk engine

`services/riskEngine.ts` is **client-side**: aggregates live alerts/telemetry/positions into zone scores. Rebuild as pure functions for easy vitest coverage.

## 8.9 Styling conventions

Dark control-room palette (`panel`, `border`, status tokens). Prefer existing utility classes; don’t invent a second design system mid-rebuild.

## 8.10 Exercises

1. Disconnect WS; confirm REST poll still shows status; reconnect and see live motion resume.  
2. Force an alert; verify Alerts page shows miner **name**.  
3. Toggle level L4; confirm other levels dim.

## 8.11 Checkpoint

Dashboard rebuild path is clear. Next: **API & MQTT contracts**.


---

# Chapter 09 — APIs, MQTT Topics, and WebSocket Contracts

## 9.1 REST (representative)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Liveness |
| GET | `/api/mine` | Graph + levels |
| GET | `/api/workers` | Worker list |
| GET | `/api/gateways` | Gateway fleet |
| GET | `/api/sensors` | Fixed sensors |
| GET | `/api/alerts` | Alert list |
| GET | `/api/jobs` | Jobs |
| GET | `/api/simulation/status` | running, sim_time, counts |
| POST | `/api/simulation/start` | Start (+ optional demo seed) |
| POST | `/api/simulation/pause` | Pause |
| POST | `/api/simulation/reset` | Reset |
| POST | `/api/simulation/speed/{n}` | Speed multiplier |
| POST | `/api/simulation/trigger/{scenario}/{worker_id}` | Inject event |
| POST | `/api/simulation/zone-gas/{zone_id}` | Zone methane event |
| POST | `/api/simulation/backhaul/{gateway_id}` | Backhaul fail/restore |
| POST | `/api/simulation/gateway/{id}/offline` | GW offline |
| POST | `/api/alerts/{id}/acknowledge` | Ack (exact path per `api.ts`) |

Always verify paths against `backend/app/main.py` and `frontend/src/services/api.ts` — they are the contract.

## 9.2 MQTT topic catalogue

Prefix: `mine/section3/`

### Wearable telemetry (example fields)

`tag_id`, vitals (`spo2`, `heart_rate`, …), gas readings, `battery_pct`, `sim_ts`

### Position

`tag_id` / `worker_id`, `x,y,z`, `edge_id`, `confidence`, `method` (radio vs continuous), `sim_ts`

### Alert

`alert_id`, `worker_id`, `type`, `severity`, `status`, location fields, `description`, timestamps

### Command

`{"command": "BURST_ON"}` / `BURST_OFF`

### Gateway status

Online flags, backhaul, optional RSSI report aggregates

### Job

`job_id`, `alert_id`, `worker_id`, `title`, `priority`, `status`

### Sensor status

Reading + online/degraded/fault

## 9.3 WebSocket frame

```json
{ "topic": "mine/section3/wearable/WD-W04/alert", "payload": { "...": "..." } }
```

Frontend matches substrings (`/alert`, `/telemetry`, `/position`, …). Rebuild clients must be tolerant of unknown topics (ignore).

## 9.4 Versioning advice

When extending payloads:

1. Add optional fields; don’t rename required ones casually.  
2. Update Pydantic models + TS types + handbook appendix together.  
3. Add a pytest asserting old minimal payload still parses if you claim compatibility.

## 9.5 Exercises

1. Subscribe with any MQTT client to `mine/section3/#` while sim runs; classify message rates.  
2. Diff a telemetry payload vs types in `types/index.ts`.  
3. Document one new field you’d add for “helmet lamp on” end-to-end.

## 9.6 Checkpoint

Contracts are explicit. Next: **testing and scenarios**.


---

# Chapter 10 — Testing and Scenario Drills

## 10.1 Backend tests

```bash
cd backend
set PYTHONPATH=.
pytest tests/ -v
```

Typical modules:

| Test file | Guards |
|-----------|--------|
| `test_mine_graph.py` (name may vary) | Graph load / snap |
| Movement tests | Workers stay on edges over many steps |
| `test_positioning.py` | 3D distance; **no ground truth** into estimator |
| `test_alerts_and_jobs.py` | Thresholds, lifecycle, jobs |
| `test_scenarios.py` | Fall/panic/etc. publish paths |
| IMU tests | Fusion advances between fixes |

**Rebuild rule:** add a test when you add a safety invariant.

## 10.2 Frontend tests

```bash
cd frontend
npm test
```

Prefer pure functions (`riskEngine`, `status`) for unit tests. Component tests optional.

## 10.3 Built-in scenarios

Triggered via REST (see Swagger):

| Scenario | Typical effect |
|----------|----------------|
| `fall` | Freeze + CRITICAL |
| `panic` | CRITICAL, still mobile |
| `low_spo2` / `high_hr` | Vitals breach |
| `methane` | Gas CRITICAL |
| `clear` | Resolve / resume |
| zone-gas | Area-wide methane |

Demo seed on start may inject several CRITICALS for classroom use.

## 10.4 Manual drill script (30 minutes)

1. Start stack; confirm 85 gateways online.  
2. Track W04; watch beacon.  
3. `trigger/fall/W04` → alert + job.  
4. Acknowledge on Alerts page.  
5. Systems: take nearest GW offline → observe nearest_gateway / RSSI.  
6. Restore GW.  
7. Filter map to L3 only.  
8. Pause sim; confirm markers freeze; start again.

## 10.5 Logging drills

Reproduce an issue once with tags:

```
RADIO → POSITION → ALERT → JOB → MQTT
```

If POSITION never logs after RADIO, multilateration likely returned `None` (too few GWs / bad geometry).

## 10.6 Exercises

1. Break `rssi_to_distance` on purpose; watch tests fail.  
2. Write a vitest for “CRITICAL alert implies risk score increase” using riskEngine.  
3. Time how long until comm-loss alert after stopping publishes (if testable).

## 10.7 Checkpoint

You can prove behaviour with tests and drills. Next: **operations runbook**.


---

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


---

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


---

# Appendix A — Glossary

| Term | Definition |
|------|------------|
| RTLS | Real-Time Location System |
| RSSI | Received Signal Strength Indicator (dBm) |
| Path-loss exponent \(n\) | How fast signal decays with log-distance |
| Multilateration | Position from distances to known anchors |
| Map matching | Project estimate onto tunnel graph |
| Gateway / GW | Fixed radio unit with surveyed coordinates |
| Wearable / tag | Miner-worn transmitter + sensors |
| Burst mode | Faster telemetry during alarms |
| Edge | Tunnel/shaft segment between nodes |
| Zone | Logical area id on edges for risk/gas |
| CRITICAL / WARNING | Alert severities |
| Continuous track | Sim ground-truth pose for smooth UI |
| MQTT | Message bus between producers/consumers |
| WebSocket bridge | Browser fan-out of MQTT-shaped topics |
| ChirpStack | Real-world LoRaWAN network server (migration target) |
| DOP | Dilution of precision (geometry quality) |
| Invert | Tunnel floor (bottom of circular drive) |

# Appendix B — File Index (priority order)

| Path | One-line purpose |
|------|------------------|
| `backend/app/main.py` | FastAPI, tick, publish |
| `backend/app/simulator/simulation_engine.py` | Orchestrator |
| `backend/app/simulator/mine.py` | Graph |
| `backend/app/simulator/workers.py` | Motion |
| `backend/app/simulator/radio.py` | RSSI |
| `backend/app/simulator/gateways.py` | GW fleet |
| `backend/app/simulator/wearable.py` | Telemetry |
| `backend/app/simulator/sensors.py` | Fixed sensors |
| `backend/app/simulator/scenarios.py` | Injected events |
| `backend/app/positioning/multilateration.py` | RSSI→XYZ |
| `backend/app/positioning/map_matching.py` | Snap |
| `backend/app/positioning/imu_fusion.py` | Dead reckoning |
| `backend/app/alerts/engine.py` | Alerts |
| `backend/app/jobs/engine.py` | Jobs |
| `backend/app/mqtt/topics.py` | Topic builders |
| `frontend/src/hooks/useLiveData.ts` | Live state |
| `frontend/src/components/MineMap3D.tsx` | 3D map |
| `frontend/src/services/api.ts` | REST |
| `frontend/src/services/riskEngine.ts` | Zone risk |
| `config/generate_3d_mine.py` | World generator |
| `docs/architecture.md` | Diagrams |
| `docker-compose.yml` | Full stack |

# Appendix C — Formula sheet

**Path loss**

\[\mathrm{RSSI}(d)=\mathrm{RSSI}_{1\mathrm{m}}-10n\log_{10}d+\varepsilon\]

**Range**

\[d=10^{(\mathrm{RSSI}_{1\mathrm{m}}-\mathrm{RSSI})/(10n)}\]

**3D distance**

\[d=\sqrt{(x_t-x_g)^2+(y_t-y_g)^2+(z_t-z_g)^2}\]

**Linearized multilateration** (after subtracting anchor 1): rows of \(A\) are \(2(x_i-x_1), 2(y_i-y_1), 2(z_i-z_1)\); solve \(A[x\,y\,z]^T=b\) by least squares.

# Appendix D — Level depths (this blueprint)

| Level | depth_m (Y) |
|-------|-------------|
| SURFACE | 0 |
| L1 | −100 |
| L2 | −250 |
| L3 | −400 |
| L4 | −550 |

Shaft columns (XZ): Main (0,0), Vent (55,45), Escape (−70,−55) — see generator constants.


---

