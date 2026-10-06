import type { Alert, Worker } from "../types";

export type DisplayStatus = "NORMAL" | "WARNING" | "CRITICAL" | "LOST";

export function workerDisplayStatus(worker: Worker, alerts: Record<string, Alert>): DisplayStatus {
  const active = Object.values(alerts).filter(
    (a) => a.worker_id === worker.worker_id && a.status !== "RESOLVED"
  );
  if (active.some((a) => a.type === "COMM_LOSS")) return "LOST";
  if (active.some((a) => a.severity === "CRITICAL")) return "CRITICAL";
  if (active.some((a) => a.severity === "WARNING")) return "WARNING";
  return "NORMAL";
}

export const STATUS_COLOR: Record<DisplayStatus, string> = {
  NORMAL: "#2fd47b",
  WARNING: "#f5a524",
  CRITICAL: "#f13c3c",
  LOST: "#6b7683",
};

export function formatSimTime(seconds: number): string {
  const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}
