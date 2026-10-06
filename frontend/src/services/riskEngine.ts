import type { Alert, Gateway, PositionEstimate, Telemetry, Worker } from "../types";

export type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export interface RiskFactor {
  id: string;
  label: string;
  weight: number;
  detail: string;
}

export interface ZoneRisk {
  zoneId: string;
  score: number;
  level: RiskLevel;
  factors: RiskFactor[];
  summary: string;
  actions: string[];
  minerCount: number;
  activeAlerts: number;
}

export interface MineRiskReport {
  overall: ZoneRisk;
  zones: ZoneRisk[];
  generatedAt: number;
}

const LEVEL_THRESHOLDS: { max: number; level: RiskLevel }[] = [
  { max: 25, level: "LOW" },
  { max: 50, level: "MODERATE" },
  { max: 75, level: "HIGH" },
  { max: 101, level: "CRITICAL" },
];

export function riskLevel(score: number): RiskLevel {
  for (const t of LEVEL_THRESHOLDS) {
    if (score < t.max) return t.level;
  }
  return "CRITICAL";
}

export const RISK_LEVEL_COLOR: Record<RiskLevel, string> = {
  LOW: "#2fd47b",
  MODERATE: "#f5a524",
  HIGH: "#fb7185",
  CRITICAL: "#f13c3c",
};

function clamp(n: number, lo = 0, hi = 100) {
  return Math.min(hi, Math.max(lo, n));
}

function workerZone(
  worker: Worker,
  positionByTag: Record<string, PositionEstimate>,
  edgeZone: Record<string, string>,
): string {
  const pos = positionByTag[worker.wearable_id];
  if (pos?.zone_id) return pos.zone_id;
  return edgeZone[worker.current_edge_id] ?? "UNKNOWN";
}

function buildActions(factors: RiskFactor[], level: RiskLevel): string[] {
  const actions: string[] = [];
  const ids = new Set(factors.map((f) => f.id));
  if (ids.has("methane")) actions.push("Increase ventilation / restrict entry in affected drifts");
  if (ids.has("low_o2")) actions.push("Check ventilation integrity and evacuate if O₂ remains low");
  if (ids.has("alerts_critical") || ids.has("vitals")) actions.push("Dispatch response team to flagged miners");
  if (ids.has("gateway")) actions.push("Restore gateway backhaul / relocate radio coverage");
  if (ids.has("burst") || ids.has("incapacitated")) actions.push("Confirm wearable burst mode and miner status");
  if (level === "CRITICAL" && actions.length === 0) actions.push("Initiate zone emergency protocol");
  if (actions.length === 0) actions.push("Continue routine monitoring");
  return actions.slice(0, 4);
}

function summarize(zoneId: string, score: number, level: RiskLevel, factors: RiskFactor[]): string {
  if (factors.length === 0) {
    return `${zoneId}: conditions nominal (score ${score.toFixed(0)}).`;
  }
  const top = factors.slice(0, 2).map((f) => f.label).join("; ");
  return `${zoneId} is ${level} risk (${score.toFixed(0)}/100). Primary drivers: ${top}.`;
}

function scoreZone(input: {
  zoneId: string;
  workers: Worker[];
  telemetryByTag: Record<string, Telemetry>;
  alerts: Alert[];
  gateways: Gateway[];
  historyByTag: Record<string, Telemetry[]>;
}): ZoneRisk {
  const { zoneId, workers, telemetryByTag, alerts, gateways, historyByTag } = input;
  const factors: RiskFactor[] = [];
  let score = 0;

  const activeCritical = alerts.filter((a) => a.status === "ACTIVE" && a.severity === "CRITICAL");
  const activeWarning = alerts.filter((a) => a.status === "ACTIVE" && a.severity === "WARNING");
  if (activeCritical.length) {
    const w = Math.min(35, activeCritical.length * 12);
    score += w;
    factors.push({
      id: "alerts_critical",
      label: "Critical alerts",
      weight: w,
      detail: `${activeCritical.length} active CRITICAL alert(s) in zone`,
    });
  }
  if (activeWarning.length) {
    const w = Math.min(15, activeWarning.length * 5);
    score += w;
    factors.push({
      id: "alerts_warning",
      label: "Warning alerts",
      weight: w,
      detail: `${activeWarning.length} active WARNING alert(s)`,
    });
  }

  const teles = workers
    .map((w) => telemetryByTag[w.wearable_id])
    .filter((t): t is Telemetry => !!t);

  if (teles.length) {
    const maxCh4 = Math.max(...teles.map((t) => t.ch4_lel));
    const minO2 = Math.min(...teles.map((t) => t.o2_ambient));
    const avgHr = teles.reduce((s, t) => s + t.hr, 0) / teles.length;
    const minSpo2 = Math.min(...teles.map((t) => t.spo2));

    // Recent history peak methane
    let histPeakCh4 = maxCh4;
    for (const w of workers) {
      const hist = historyByTag[w.wearable_id] ?? [];
      for (const t of hist.slice(-60)) histPeakCh4 = Math.max(histPeakCh4, t.ch4_lel);
    }

    if (histPeakCh4 >= 10) {
      const w = clamp((histPeakCh4 / 50) * 30, 8, 30);
      score += w;
      factors.push({
        id: "methane",
        label: "Elevated methane",
        weight: w,
        detail: `Peak CH₄ ${histPeakCh4.toFixed(1)} LEL (live max ${maxCh4.toFixed(1)})`,
      });
    }
    if (minO2 < 19.5) {
      const w = clamp((19.5 - minO2) * 12, 6, 25);
      score += w;
      factors.push({
        id: "low_o2",
        label: "Low ambient oxygen",
        weight: w,
        detail: `Lowest ambient O₂ ${minO2.toFixed(2)}%`,
      });
    }
    if (minSpo2 < 92 || avgHr > 120) {
      const w = clamp(minSpo2 < 88 ? 20 : 12, 8, 22);
      score += w;
      factors.push({
        id: "vitals",
        label: "Miner vital stress",
        weight: w,
        detail: `Min SpO₂ ${minSpo2}% · avg HR ${avgHr.toFixed(0)} bpm`,
      });
    }
  }

  const offlineGw = gateways.filter(
    (g) => g.status !== "ONLINE" || g.backhaul_primary === "OFFLINE",
  );
  if (offlineGw.length) {
    const w = Math.min(20, offlineGw.length * 8);
    score += w;
    factors.push({
      id: "gateway",
      label: "Gateway / backhaul degradation",
      weight: w,
      detail: `${offlineGw.length} gateway(s) offline or primary backhaul down`,
    });
  }

  const burst = workers.filter((w) => w.mode === "burst" || w.incapacitated);
  if (burst.length) {
    const w = Math.min(15, burst.length * 5);
    score += w;
    factors.push({
      id: burst.some((b) => b.incapacitated) ? "incapacitated" : "burst",
      label: "Emergency wearable mode",
      weight: w,
      detail: `${burst.length} miner(s) in burst / incapacitated`,
    });
  }

  score = clamp(score);
  factors.sort((a, b) => b.weight - a.weight);
  const level = riskLevel(score);

  return {
    zoneId,
    score,
    level,
    factors,
    summary: summarize(zoneId, score, level, factors),
    actions: buildActions(factors, level),
    minerCount: workers.length,
    activeAlerts: alerts.filter((a) => a.status === "ACTIVE").length,
  };
}

export function computeMineRisk(input: {
  zones: string[];
  workers: Record<string, Worker>;
  telemetryByTag: Record<string, Telemetry>;
  telemetryHistoryByTag: Record<string, Telemetry[]>;
  positionByTag: Record<string, PositionEstimate>;
  alerts: Record<string, Alert>;
  gateways: Record<string, Gateway>;
  edgeZone: Record<string, string>;
  simTimeS: number;
}): MineRiskReport {
  const workerList = Object.values(input.workers);
  const alertList = Object.values(input.alerts);
  const gwList = Object.values(input.gateways);

  const zones = input.zones.length
    ? input.zones
    : [...new Set([...Object.values(input.edgeZone), ...gwList.map((g) => g.zone_id)])].sort();

  const zoneReports = zones.map((zoneId) => {
    const zoneWorkers = workerList.filter(
      (w) => workerZone(w, input.positionByTag, input.edgeZone) === zoneId,
    );
    const zoneAlerts = alertList.filter((a) => {
      if (a.location_zone_id === zoneId) return true;
      const w = input.workers[a.worker_id];
      return w ? workerZone(w, input.positionByTag, input.edgeZone) === zoneId : false;
    });
    const zoneGateways = gwList.filter((g) => g.zone_id === zoneId);
    return scoreZone({
      zoneId,
      workers: zoneWorkers,
      telemetryByTag: input.telemetryByTag,
      alerts: zoneAlerts,
      gateways: zoneGateways,
      historyByTag: input.telemetryHistoryByTag,
    });
  });

  // Mine-wide: max of zone scores with slight uplift from multi-zone incidents
  const criticalZones = zoneReports.filter((z) => z.level === "CRITICAL" || z.level === "HIGH").length;
  const base = zoneReports.length ? Math.max(...zoneReports.map((z) => z.score), 0) : 0;
  const overallScore = clamp(base + (criticalZones > 1 ? 8 : 0));

  // Merge similar factors across zones into one clear line each
  const merged = new Map<string, { label: string; weight: number; zones: string[]; detail: string }>();
  for (const z of zoneReports) {
    for (const f of z.factors) {
      const prev = merged.get(f.id);
      if (!prev) {
        merged.set(f.id, { label: f.label, weight: f.weight, zones: [z.zoneId], detail: f.detail });
      } else {
        prev.weight = Math.max(prev.weight, f.weight);
        if (!prev.zones.includes(z.zoneId)) prev.zones.push(z.zoneId);
        if (f.weight >= prev.weight) prev.detail = f.detail;
      }
    }
  }
  const allFactors = [...merged.values()]
    .map((m) => ({
      id: m.label,
      label: m.label,
      weight: m.weight,
      detail:
        m.zones.length > 1
          ? `${m.detail} (also in ${m.zones.length} zones)`
          : `${m.detail} — ${m.zones[0]}`,
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6);

  const overallLevel = riskLevel(overallScore);

  const overall: ZoneRisk = {
    zoneId: "MINE",
    score: overallScore,
    level: overallLevel,
    factors: allFactors,
    summary: summarize("Mine-wide", overallScore, overallLevel, allFactors),
    actions: buildActions(allFactors, overallLevel),
    minerCount: workerList.length,
    activeAlerts: alertList.filter((a) => a.status === "ACTIVE").length,
  };

  return {
    overall,
    zones: zoneReports.sort((a, b) => b.score - a.score),
    generatedAt: input.simTimeS,
  };
}
