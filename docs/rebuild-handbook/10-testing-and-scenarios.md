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
