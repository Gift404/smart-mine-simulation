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
