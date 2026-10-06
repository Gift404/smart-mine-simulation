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
