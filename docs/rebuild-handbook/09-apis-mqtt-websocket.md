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
