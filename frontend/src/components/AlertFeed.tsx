import type { Alert } from "../types";
import { api } from "../services/api";
import { useLive } from "../context/LiveDataContext";

export default function AlertFeed({ alerts }: { alerts: Record<string, Alert> }) {
  const { state } = useLive();
  const sorted = Object.values(alerts).sort((a, b) => b.created_sim_ts - a.created_sim_ts);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-panel2 p-4">
      <h2 className="mb-3 shrink-0 text-sm font-bold uppercase tracking-wide text-slate-300">Alert Feed</h2>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {sorted.length === 0 && <p className="text-sm text-slate-500">No alerts.</p>}
        {sorted.map((a) => {
          const name = state.workers[a.worker_id]?.name;
          const minerLabel = name ? `${a.worker_id} · ${name}` : a.worker_id;
          return (
          <div key={a.alert_id}
               className={`rounded border-l-4 bg-panel p-2 text-sm ${
                 a.severity === "CRITICAL" ? "border-status-critical" : "border-status-warning"
               } ${a.status === "RESOLVED" ? "opacity-40" : ""}`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold ${a.severity === "CRITICAL" ? "text-status-critical" : "text-status-warning"}`}>
                {a.severity}
              </span>
              <span className="text-[10px] text-slate-500">{a.status}</span>
            </div>
            <div className="font-semibold text-slate-100">{minerLabel} — {a.description}</div>
            <div className="text-xs text-slate-500">
              {a.type.startsWith("RESTRICTED_ZONE") ? "GEOFENCE · " : ""}
              {a.location_zone_id ?? a.location_edge_id}
            </div>
            {a.type.startsWith("RESTRICTED_ZONE") && a.status === "ACTIVE" && (
              <div className="mt-0.5 animate-pulse text-[10px] font-semibold text-rose-400">
                Wearable vibrating — leave restricted area
              </div>
            )}
            {a.status === "ACTIVE" && (
              <button
                onClick={() => api.acknowledgeAlert(a.alert_id)}
                className="mt-1 rounded bg-slate-700 px-2 py-0.5 text-[11px] text-slate-100 hover:bg-slate-600"
              >
                Acknowledge
              </button>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
