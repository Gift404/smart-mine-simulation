import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import { connectLiveSocket } from "../services/websocket";
import type {
  Worker, Gateway, Alert, Job, SimulationStatus, Telemetry, PositionEstimate, WsMessage, MineGraph,
  SignalSample, MineSensor, Vehicle, Geofence, SimulationInfo,
} from "../types";

export interface LiveState {
  simulations: SimulationInfo[];
  mine: MineGraph | null;
  workers: Record<string, Worker>;
  vehicles: Record<string, Vehicle>;
  gateways: Record<string, Gateway>;
  sensors: Record<string, MineSensor>;
  alerts: Record<string, Alert>;
  jobs: Record<string, Job>;
  geofences: Geofence[];
  status: SimulationStatus | null;
  telemetryByTag: Record<string, Telemetry>;
  telemetryHistoryByTag: Record<string, Telemetry[]>;
  positionByTag: Record<string, PositionEstimate>;
  signalByTag: Record<string, { gateway_id: string; rssi: number }[]>;
  signalHistoryByTag: Record<string, SignalSample[]>;
}

const MAX_HISTORY_POINTS = 600; // ~ plenty for a 30 min window at burst-mode cadence
const SIMULATION_TOPIC = "mine/section3/simulation/active";

const EMPTY_STATE: LiveState = {
  simulations: [],
  mine: null, workers: {}, vehicles: {}, gateways: {}, sensors: {}, alerts: {}, jobs: {},
  geofences: [],
  status: null, telemetryByTag: {}, telemetryHistoryByTag: {}, positionByTag: {},
  signalByTag: {}, signalHistoryByTag: {},
};

export function useLiveData() {
  const [state, setState] = useState<LiveState>(EMPTY_STATE);
  const [switching, setSwitching] = useState(false);
  const signalBuffer = useRef<Record<string, Record<string, number>>>({});
  const loadedSimulationId = useRef<string | null>(null);
  const switchingRef = useRef(false);
  const reloadingRef = useRef(false);
  const reloadPendingRef = useRef(false);

  /** Replace all state from REST (initial load and after a simulation switch). */
  const reload = useCallback(async () => {
    if (reloadingRef.current) {
      reloadPendingRef.current = true;
      return;
    }
    reloadingRef.current = true;
    try {
      do {
        reloadPendingRef.current = false;
        const [simulations, mine, workers, vehicles, gateways, sensors, alerts, jobs, geofences, status] = await Promise.all([
          api.simulations().catch(() => [] as SimulationInfo[]),
          api.mine(), api.workers(), api.vehicles(), api.gateways(), api.sensors(), api.alerts(), api.jobs(),
          api.geofences().catch(() => [] as Geofence[]), api.status(),
        ]);
        signalBuffer.current = {};
        loadedSimulationId.current = mine.simulation_id ?? null;
        setState({
          ...EMPTY_STATE,
          simulations,
          mine,
          workers: Object.fromEntries(workers.map((w) => [w.worker_id, w])),
          vehicles: Object.fromEntries(vehicles.map((v) => [v.vehicle_id, v])),
          gateways: Object.fromEntries(gateways.map((g) => [g.gateway_id, g])),
          sensors: Object.fromEntries(sensors.map((x) => [x.sensor_id, x])),
          alerts: Object.fromEntries(alerts.map((a) => [a.alert_id, a])),
          jobs: Object.fromEntries(jobs.map((j) => [j.job_id, j])),
          geofences,
          status,
        });
      } while (reloadPendingRef.current);
    } finally {
      reloadingRef.current = false;
    }
  }, []);

  const switchSimulation = useCallback(async (simulationId: string) => {
    if (switchingRef.current || simulationId === loadedSimulationId.current) return;
    switchingRef.current = true;
    setSwitching(true);
    try {
      await api.activateSimulation(simulationId);
      await reload();
    } finally {
      switchingRef.current = false;
      setSwitching(false);
    }
  }, [reload]);

  // bootstrap from REST, then poll status periodically as a safety net
  useEffect(() => {
    reload().catch(console.error);
    // Light poll — live data comes from WebSocket; don't hammer a busy API
    const interval = setInterval(() => {
      api.status()
        .then((status) => {
          const changed = status.simulation_id && loadedSimulationId.current
            && status.simulation_id !== loadedSimulationId.current;
          if (changed && !switchingRef.current) {
            reload().catch(console.error);
          } else {
            setState((s) => ({ ...s, status }));
          }
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [reload]);

  useEffect(() => {
    const disconnect = connectLiveSocket((msg: WsMessage) => {
      const { topic, payload } = msg;
      // Frames from the outgoing engine can still be in flight while switching
      if (switchingRef.current) return;

      if (topic === SIMULATION_TOPIC) {
        const id = (payload as { simulation_id?: string }).simulation_id;
        if (id && id !== loadedSimulationId.current) reload().catch(console.error);
        return;
      }

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
            watch_vibrating:
              (p as { watch_vibrating?: boolean }).watch_vibrating ?? worker.watch_vibrating,
            geofence_id: (p as { geofence_id?: string | null }).geofence_id ?? worker.geofence_id,
            geofence_name: (p as { geofence_name?: string | null }).geofence_name ?? worker.geofence_name,
            mode: ((p as { mode?: Worker["mode"] }).mode ?? worker.mode) as Worker["mode"],
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
        const cmd = payload as {
          command?: string;
          fence_id?: string;
          fence_name?: string;
          message?: string;
        };
        const parts = topic.split("/");
        const tagIdx = parts.indexOf("wearable");
        const tagId = tagIdx >= 0 ? parts[tagIdx + 1] : null;
        if (!tagId || !cmd.command) return;
        setState((s) => {
          const worker = Object.values(s.workers).find((w) => w.wearable_id === tagId);
          if (!worker) return s;
          let next = { ...worker };
          if (cmd.command === "VIBRATE_ON") {
            next = {
              ...next,
              watch_vibrating: true,
              geofence_id: cmd.fence_id ?? next.geofence_id,
              geofence_name: cmd.fence_name ?? next.geofence_name,
              mode: "burst",
            };
          } else if (cmd.command === "VIBRATE_OFF") {
            next = { ...next, watch_vibrating: false, geofence_id: null, geofence_name: null };
          } else if (cmd.command === "BURST_ON") {
            next = { ...next, mode: "burst" };
          } else if (cmd.command === "BURST_OFF") {
            next = { ...next, mode: "normal" };
          }
          return { ...s, workers: { ...s.workers, [worker.worker_id]: next } };
        });
      }
    });
    return disconnect;
  }, [reload]);

  return { state, switching, switchSimulation };
}
