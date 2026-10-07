import type {
  Worker, Gateway, Alert, Job, SimulationStatus, ScenarioName, MineGraph, MineSensor, Vehicle, Geofence, SimulationInfo,
} from "../types";

function apiBase(): string {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL as string;
  // Vite dev → local API; production build → same origin (nginx proxies /api)
  if (import.meta.env.DEV) return "http://localhost:8000";
  return "";
}

const BASE = apiBase();

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function post<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "POST" });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

export const api = {
  mine: () => get<MineGraph>("/api/mine"),
  workers: () => get<Worker[]>("/api/workers"),
  gateways: () => get<Gateway[]>("/api/gateways"),
  sensors: () => get<MineSensor[]>("/api/sensors"),
  vehicles: () => get<Vehicle[]>("/api/vehicles"),
  alerts: () => get<Alert[]>("/api/alerts"),
  jobs: () => get<Job[]>("/api/jobs"),
  geofences: () => get<Geofence[]>("/api/geofences"),
  zones: () => get<string[]>("/api/zones"),
  status: () => get<SimulationStatus>("/api/simulation/status"),
  simulations: () => get<SimulationInfo[]>("/api/simulations"),
  activateSimulation: (simulationId: string) =>
    post<{ simulation_id: string; running: boolean }>(`/api/simulations/${encodeURIComponent(simulationId)}/activate`),

  start: () => post("/api/simulation/start"),
  pause: () => post("/api/simulation/pause"),
  reset: () => post("/api/simulation/reset"),
  setSpeed: (multiplier: number) => post(`/api/simulation/speed/${multiplier}`),
  acknowledgeAlert: (alertId: string) => post(`/api/alerts/${alertId}/acknowledge`),
  triggerScenario: (scenario: ScenarioName, workerId: string) =>
    post(`/api/simulation/trigger/${scenario}/${workerId}`),
  triggerZoneGas: (zoneId: string, value = 30) =>
    post(`/api/simulation/zone-gas/${encodeURIComponent(zoneId)}?value=${value}`),
  setBackhaulFailure: (gatewayId: string, failed: boolean) =>
    post(`/api/simulation/backhaul/${gatewayId}?failed=${failed}`),
  setGatewayOffline: (gatewayId: string, offline: boolean) =>
    post(`/api/simulation/gateway/${gatewayId}/offline?offline=${offline}`),
  setSensorOffline: (sensorId: string, offline: boolean) =>
    post(`/api/simulation/sensor/${encodeURIComponent(sensorId)}/offline?offline=${offline}`),
  setSensorFault: (sensorId: string, fault: boolean) =>
    post(`/api/simulation/sensor/${encodeURIComponent(sensorId)}/fault?fault=${fault}`),
};
