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
