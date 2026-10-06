import { useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import { connectLiveSocket } from "../services/websocket";
import type {
  Worker, Gateway, Alert, Job, SimulationStatus, Telemetry, PositionEstimate, WsMessage, MineGraph,
  SignalSample, MineSensor, Vehicle,
} from "../types";

export interface LiveState {
  mine: MineGraph | null;
  workers: Record<string, Worker>;
  vehicles: Record<string, Vehicle>;
  gateways: Record<string, Gateway>;
  sensors: Record<string, MineSensor>;
  alerts: Record<string, Alert>;
  jobs: Record<string, Job>;
  status: SimulationStatus | null;
  telemetryByTag: Record<string, Telemetry>;
  telemetryHistoryByTag: Record<string, Telemetry[]>;
  positionByTag: Record<string, PositionEstimate>;
  signalByTag: Record<string, { gateway_id: string; rssi: number }[]>;
  signalHistoryByTag: Record<string, SignalSample[]>;
}

const MAX_HISTORY_POINTS = 600; // ~ plenty for a 30 min window at burst-mode cadence

export function useLiveData() {
  const [state, setState] = useState<LiveState>({
    mine: null, workers: {}, vehicles: {}, gateways: {}, sensors: {}, alerts: {}, jobs: {},
    status: null, telemetryByTag: {}, telemetryHistoryByTag: {}, positionByTag: {},
    signalByTag: {}, signalHistoryByTag: {},
  });
  const signalBuffer = useRef<Record<string, Record<string, number>>>({});

  // bootstrap from REST, then poll status/alerts/jobs periodically as a safety net
  useEffect(() => {
    async function bootstrap() {
      const [mine, workers, vehicles, gateways, sensors, alerts, jobs, status] = await Promise.all([
        api.mine(), api.workers(), api.vehicles(), api.gateways(), api.sensors(), api.alerts(), api.jobs(), api.status(),
      ]);
      setState((s) => ({
        ...s,
        mine,
        workers: Object.fromEntries(workers.map((w) => [w.worker_id, w])),
        vehicles: Object.fromEntries(vehicles.map((v) => [v.vehicle_id, v])),
        gateways: Object.fromEntries(gateways.map((g) => [g.gateway_id, g])),
        sensors: Object.fromEntries(sensors.map((x) => [x.sensor_id, x])),
        alerts: Object.fromEntries(alerts.map((a) => [a.alert_id, a])),
        jobs: Object.fromEntries(jobs.map((j) => [j.job_id, j])),
        status,
      }));
    }
    bootstrap().catch(console.error);
    // Light poll — live data comes from WebSocket; don't hammer a busy API
    const interval = setInterval(() => {
      api.status()
        .then((status) => setState((s) => ({ ...s, status })))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const disconnect = connectLiveSocket((msg: WsMessage) => {
      const { topic, payload } = msg;

      if (topic.includes("/vehicle/") && topic.includes("/position")) {
        const v = payload as Vehicle;
        setState((s) => {
          const nextVehicles = { ...s.vehicles, [v.vehicle_id]: { ...s.vehicles[v.vehicle_id], ...v } };
          let nextWorkers = s.workers;
          if (v.driver_worker_id && s.workers[v.driver_worker_id]) {
            const d = s.workers[v.driver_worker_id];
            nextWorkers = {
              ...s.workers,
              [v.driver_worker_id]: {
                ...d,
                x: v.x,
                y: v.y,
                z: v.z,
                level: v.level ?? d.level,
                heading_deg: v.heading_deg,
                current_edge_id: v.edge_id ?? d.current_edge_id,
                activity: `Driving · ${v.activity ?? v.phase}`,
                activity_detail: v.vehicle_id,
                assigned_vehicle_id: v.vehicle_id,
              },
            };
          }
          return { ...s, vehicles: nextVehicles, workers: nextWorkers };
        });
      } else if (topic.includes("/telemetry")) {
        const t: Telemetry = payload;
        setState((s) => {
          const history = [...(s.telemetryHistoryByTag[t.tag_id] ?? []), t].slice(-MAX_HISTORY_POINTS);
          return {
            ...s,
            telemetryByTag: { ...s.telemetryByTag, [t.tag_id]: t },
            telemetryHistoryByTag: { ...s.telemetryHistoryByTag, [t.tag_id]: history },
          };
        });
      } else if (topic.includes("/position")) {
        const p: PositionEstimate = payload;
        setState((s) => {
          const worker = Object.values(s.workers).find((w) => w.wearable_id === p.tag_id);
          if (!worker) {
            return { ...s, positionByTag: { ...s.positionByTag, [p.tag_id]: p } };
          }
          // Drivers follow vehicle topic — don't let wearable track override
          if (worker.assigned_vehicle_id) {
            return { ...s, positionByTag: { ...s.positionByTag, [p.tag_id]: p } };
          }
          const fz = p.fused_z ?? worker.z ?? 0;
          const jump = Math.hypot(p.fused_x - worker.x, p.fused_y - worker.y, fz - (worker.z ?? 0));
          const nextWorker = {
            ...worker,
            x: p.fused_x,
            y: p.fused_y,
            z: fz,
            level: p.level ?? worker.level,
            depth_m: p.depth_m ?? p.fused_y,
            nearest_gateway: p.nearest_gateway ?? worker.nearest_gateway,
            current_edge_id: p.edge_id ?? worker.current_edge_id,
            activity: (p as { activity?: string }).activity ?? worker.activity,
            activity_detail: (p as { activity_detail?: string | null }).activity_detail ?? worker.activity_detail,
            assigned_vehicle_id:
              (p as { assigned_vehicle_id?: string | null }).assigned_vehicle_id ?? worker.assigned_vehicle_id,
          };
          if (jump > 40) {
            return { ...s, positionByTag: { ...s.positionByTag, [p.tag_id]: p } };
          }
          return {
            ...s,
            positionByTag: { ...s.positionByTag, [p.tag_id]: p },
            workers: { ...s.workers, [worker.worker_id]: nextWorker },
          };
        });
      } else if (topic.includes("/alert")) {
        const a: Alert = payload;
        setState((s) => ({ ...s, alerts: { ...s.alerts, [a.alert_id]: a } }));
      } else if (topic.startsWith("mine/section3/job/")) {
        const j: Job = payload;
        setState((s) => ({ ...s, jobs: { ...s.jobs, [j.job_id]: j } }));
      } else if (topic.includes("/gateway/") && payload.rssi_report) {
        const r = payload.rssi_report as { tag_id: string; gateway_id: string; rssi: number; ts: number };
        signalBuffer.current[r.tag_id] = { ...signalBuffer.current[r.tag_id], [r.gateway_id]: r.rssi };
        const list = Object.entries(signalBuffer.current[r.tag_id]).map(([gateway_id, rssi]) => ({
          gateway_id, rssi: rssi as number,
        }));
        const sample: SignalSample = { ts: r.ts, gateway_id: r.gateway_id, rssi: r.rssi };
        setState((s) => {
          const hist = [...(s.signalHistoryByTag[r.tag_id] ?? []), sample].slice(-MAX_HISTORY_POINTS);
          return {
            ...s,
            signalByTag: { ...s.signalByTag, [r.tag_id]: list },
            signalHistoryByTag: { ...s.signalHistoryByTag, [r.tag_id]: hist },
          };
        });
      } else if (topic.includes("/gateway/") && payload.gateway) {
        const g: Gateway = payload.gateway;
        setState((s) => ({
          ...s,
          gateways: { ...s.gateways, [g.gateway_id]: g },
        }));
      } else if (topic.includes("/sensor/") && payload.sensor) {
        const sensor: MineSensor = payload.sensor;
        setState((s) => ({
          ...s,
          sensors: { ...s.sensors, [sensor.sensor_id]: sensor },
        }));
      } else if (topic.includes("/command")) {
        // mode changes are also reflected in the next /workers poll; nothing to do live
      }
    });
    return disconnect;
  }, []);

  return state;
}
