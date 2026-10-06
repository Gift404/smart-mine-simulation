export type HealthState = "NORMAL" | "WARNING" | "CRITICAL" | "LOST";
export type WearableMode = "normal" | "burst";
export type AlertSeverity = "WARNING" | "CRITICAL";
export type AlertStatus = "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED";
export type JobStatus = "CREATED" | "DISPATCHED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface MineLevel {
  id: string;
  name: string;
  depth_m: number;
  label: string;
}

export interface MineNode {
  id: string;
  x: number;
  y: number; // elevation (0 surface, negative underground)
  z: number; // northing
  type: string;
  level_id?: string | null;
  depth_m?: number;
}

export interface MineEdge {
  id: string;
  start: string;
  end: string;
  length: number;
  direction: string;
  speed_limit: number;
  zone_id: string;
  level_id?: string | null;
  kind?: string;
}

export interface MineGraph {
  name: string;
  coordinate_system?: Record<string, string | number>;
  levels?: MineLevel[];
  nodes: MineNode[];
  edges: MineEdge[];
  zones?: string[];
  portals?: MinePortal[];
}

export interface MinePortal {
  node_id: string;
  dx: number;
  dy: number;
  dz?: number;
  label: string;
}

export interface SignalSample {
  ts: number;
  gateway_id: string;
  rssi: number;
}

export interface Worker {
  worker_id: string;
  name: string;
  role: string;
  wearable_id: string;
  current_edge_id: string;
  distance_along_edge_m: number;
  direction: number;
  x: number;
  y: number; // elevation
  z: number;
  level?: string;
  depth_m?: number;
  current_tunnel?: string;
  nearest_gateway?: string | null;
  heading_deg: number;
  walking_speed_mps: number;
  behavior_profile: string;
  health_state: HealthState;
  mode: WearableMode;
  last_transmission_sim_ts: number;
  incapacitated: boolean;
  activity?: string;
  activity_detail?: string | null;
  assigned_vehicle_id?: string | null;
}

export type VehicleKind = "lhd" | "ore_trailer";
export type HaulPhase =
  | "TRAVEL_TO_LOAD"
  | "LOADING"
  | "TRAVEL_TO_DUMP"
  | "DUMPING"
  | "IDLE";

export interface Vehicle {
  vehicle_id: string;
  name: string;
  kind: VehicleKind;
  driver_worker_id?: string | null;
  driver_name?: string | null;
  current_edge_id: string;
  edge_id?: string;
  distance_along_edge_m: number;
  direction: number;
  x: number;
  y: number;
  z: number;
  level?: string;
  depth_m?: number;
  heading_deg: number;
  speed_mps: number;
  phase: HaulPhase;
  cargo_fill: number;
  target_node_id?: string | null;
  load_cycles?: number;
  activity?: string;
}

export interface Telemetry {
  tag_id: string;
  seq: number;
  ts: number;
  hr: number;
  spo2: number;
  bp_sys: number;
  bp_dia: number;
  o2_ambient: number;
  ch4_lel: number;
  imu_steps_since_last: number;
  imu_heading_deg: number;
  battery_pct: number;
  mode: string;
  device_status: string;
}

export interface PositionEstimate {
  tag_id: string;
  ts: number;
  raw_x: number;
  raw_y: number;
  raw_z?: number;
  snapped_x: number;
  snapped_y: number;
  snapped_z?: number;
  edge_id: string | null;
  zone_id: string | null;
  level?: string | null;
  fused_x: number;
  fused_y: number;
  fused_z?: number;
  depth_m?: number;
  nearest_gateway?: string | null;
  confidence: number;
  confidence_label: "HIGH" | "MEDIUM" | "LOW";
  gateways_used: string[];
  method: string;
}

export interface Gateway {
  gateway_id: string;
  name?: string | null;
  x: number;
  y: number;
  z?: number;
  zone_id: string;
  level_id?: string | null;
  depth_m?: number;
  status: string;
  backhaul_primary: "ONLINE" | "OFFLINE";
  backhaul_fallback: "ONLINE" | "OFFLINE";
}

export type SensorType = "CH4" | "O2" | "AIRFLOW" | "TEMP";
export type SensorStatus = "ONLINE" | "DEGRADED" | "OFFLINE" | "FAULT";

export interface MineSensor {
  sensor_id: string;
  name: string;
  sensor_type: SensorType;
  x: number;
  y: number;
  z?: number;
  zone_id: string;
  level_id?: string | null;
  unit: string;
  linked_gateway_id: string | null;
  status: SensorStatus;
  value: number | null;
  last_reading_ts: number;
  battery_pct: number;
  maintenance_due_days: number;
}

export interface Alert {
  alert_id: string;
  worker_id: string;
  type: string;
  severity: AlertSeverity;
  value: number | null;
  threshold: number | null;
  location_edge_id: string | null;
  location_zone_id: string | null;
  description: string;
  status: AlertStatus;
  created_sim_ts: number;
  acknowledged_sim_ts: number | null;
  resolved_sim_ts: number | null;
}

export interface Job {
  job_id: string;
  alert_id: string;
  worker_id: string;
  title: string;
  location_edge_id: string | null;
  location_zone_id: string | null;
  priority: string;
  status: JobStatus;
  created_sim_ts: number;
}

export interface SimulationStatus {
  running: boolean;
  sim_time_s: number;
  speed_multiplier: number;
  workers: number;
  active_alerts: number;
  gateways_online: number;
  gateways_total: number;
  sensors_online?: number;
  sensors_total?: number;
  vehicles?: number;
}

export interface WsMessage {
  topic: string;
  payload: any;
}

export const SCENARIOS = [
  "low_spo2",
  "high_hr",
  "low_o2",
  "methane",
  "fall",
  "panic",
  "clear",
] as const;
export type ScenarioName = (typeof SCENARIOS)[number];
