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
