# Architecture

## 1. Complete system architecture

```mermaid
flowchart TD
    W[Virtual Wearable] --> R[Simulated LoRa Transmission]
    R --> GW1[Gateway 1..N]
    GW1 --> CS[ChirpStack Adapter]
    CS --> MQTT[(MQTT Broker)]

    MQTT --> POS[Positioning Engine]
    MQTT --> ALERT[Alert Engine]

    POS --> MQTT
    ALERT --> MQTT
    ALERT --> JOB[Job / Response Engine]
    JOB --> MQTT

    MQTT --> INFLUX[(InfluxDB)]
    MQTT --> WS[WebSocket API]
    WS --> DASH[React Dashboard]
```

The simulator never talks to the dashboard directly. Everything the dashboard
shows has passed through the same MQTT boundary that real hardware would use.

## 2. Data flow

```mermaid
sequenceDiagram
    participant Wear as Wearable Sim
    participant Radio as Radio Sim
    participant GWs as Gateways
    participant CS as ChirpStack Adapter
    participant MQ as MQTT
    participant Pos as Positioning Engine
    participant Alert as Alert Engine
    participant DB as InfluxDB
    participant UI as Dashboard

    Wear->>Radio: transmit(tag_id, true_x, true_y)
    Radio->>GWs: RSSI per gateway in range
    GWs->>CS: decoded frame + gateway metadata
    CS->>MQ: publish telemetry
    MQ->>Pos: RSSI observations only (no ground truth)
    Pos->>MQ: publish position (raw/snapped/fused + confidence)
    MQ->>Alert: telemetry
    Alert->>MQ: publish alert (if threshold breached)
    MQ->>DB: telemetry, position, alerts
    MQ->>UI: WebSocket bridge broadcasts all of the above
```

## 3. MQTT topics

```
mine/section3/wearable/{tag_id}/telemetry
mine/section3/wearable/{tag_id}/position
mine/section3/wearable/{tag_id}/alert
mine/section3/wearable/{tag_id}/command
mine/section3/gateway/{gw_id}/status
mine/section3/job/{job_id}
```

## 4. Positioning pipeline

```mermaid
flowchart LR
    A[Gateway RSSI observations] --> B[RSSI multilateration]
    B --> C[Raw x/y estimate]
    C --> D[Map matching / snap to tunnel graph]
    D --> E[Confidence scoring]
    E --> F[IMU dead-reckoning fusion]
    F --> G[Final fused worker position]
```

Multilateration (`positioning/multilateration.py`) only ever receives
`RssiObservation` objects — there is no code path from it back to a worker's
true coordinates (enforced by `test_positioning.py::test_positioning_pipeline_never_receives_ground_truth`).
Map matching (`positioning/map_matching.py`) then snaps that estimate onto
the nearest point on the tunnel graph, guaranteeing the reported position
can never sit inside solid rock. Between radio fixes, `positioning/imu_fusion.py`
advances the last snapped position using the worker's actual simulated
displacement each tick, so the dashboard sees smooth movement rather than a
jump once per transmit interval; its confidence score decays until the next
real fix arrives.

## 5. Alert pipeline

```mermaid
flowchart TD
    T[Telemetry] --> Check{Threshold breached?}
    Check -->|No| Resolve[Auto-resolve any existing alert]
    Check -->|Warning| WarnAlert[Create/keep WARNING alert]
    Check -->|Critical| CritAlert[Create/escalate CRITICAL alert]
    CritAlert --> Job[Job Engine: dispatch response job]
    WarnAlert --> Burst
    CritAlert --> Burst[Wearable enters BURST mode]
```

Fall and panic-button events bypass the threshold check entirely — they are
CRITICAL by definition and raise an alert (and dispatch a job) immediately.

## 6. Burst mode sequence

```mermaid
sequenceDiagram
    participant Alert as Alert Engine
    participant Sim as Simulation Engine
    participant MQ as MQTT
    participant Wear as Wearable (simulated)

    Alert->>Sim: worker now in alarm
    Sim->>MQ: publish command topic {"command": "BURST_ON"}
    Sim->>Wear: mode = BURST
    Note over Wear: transmit interval drops from 20s to 2s
    Alert->>Sim: worker alarm cleared
    Sim->>MQ: publish command topic {"command": "BURST_OFF"}
    Sim->>Wear: mode = NORMAL
```

## 7. Hardware migration path

```mermaid
flowchart TD
    subgraph Simulation [Current: Simulation]
        S1[Wearable Simulator] --> S2[Radio Simulator]
        S2 --> S3[Gateway Simulator]
        S3 --> S4[ChirpStack Adapter]
        S4 --> MQ1[(MQTT)]
    end

    subgraph RealWorld [Future: Real Hardware]
        R1[Real Wearable] --> R2[Real LoRaWAN Gateway]
        R2 --> R3[Real ChirpStack]
        R3 --> MQ1
    end

    MQ1 --> Downstream[Positioning / Alerts / Jobs / InfluxDB / Dashboard — unchanged]
```

`TelemetrySource`, `GatewaySource`, and `RadioTransport` (see `simulator/`)
are the seams: everything downstream of MQTT depends only on the topic
contracts, never on the simulator's internals, so swapping in
`LoRaTelemetrySource` / `RealGatewaySource` later requires no changes to
`positioning/`, `alerts/`, `jobs/`, `database/`, or the dashboard.
