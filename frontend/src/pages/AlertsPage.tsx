import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLive } from "../context/LiveDataContext";
import { api } from "../services/api";
import { alertTypeName, placeName } from "../services/labels";
import EmptyState from "../components/EmptyState";
import { formatSimTime } from "../services/status";
import type { Alert, AlertStatus, Job } from "../types";

type Filter = "ALL" | AlertStatus | "CRITICAL_ONLY";

export default function AlertsPage() {
  const { state } = useLive();
  const [filter, setFilter] = useState<Filter>("ACTIVE");

  const alerts = useMemo(() => {
    let list = Object.values(state.alerts);
    if (filter === "CRITICAL_ONLY") list = list.filter((a) => a.severity === "CRITICAL" && a.status === "ACTIVE");
    else if (filter !== "ALL") list = list.filter((a) => a.status === filter);
    return list.sort((a, b) => b.created_sim_ts - a.created_sim_ts);
  }, [state.alerts, filter]);

  const jobsByAlert = useMemo(() => {
    const map: Record<string, Job[]> = {};
    for (const j of Object.values(state.jobs)) {
      (map[j.alert_id] ??= []).push(j);
    }
    return map;
  }, [state.jobs]);

  const counts = useMemo(() => {
    const all = Object.values(state.alerts);
    return {
      ACTIVE: all.filter((a) => a.status === "ACTIVE").length,
      ACKNOWLEDGED: all.filter((a) => a.status === "ACKNOWLEDGED").length,
      RESOLVED: all.filter((a) => a.status === "RESOLVED").length,
      CRITICAL: all.filter((a) => a.severity === "CRITICAL" && a.status === "ACTIVE").length,
      ALL: all.length,
    };
  }, [state.alerts]);

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "ACTIVE", label: "Active", count: counts.ACTIVE },
    { id: "CRITICAL_ONLY", label: "Critical", count: counts.CRITICAL },
    { id: "ACKNOWLEDGED", label: "Acknowledged", count: counts.ACKNOWLEDGED },
    { id: "RESOLVED", label: "Resolved", count: counts.RESOLVED },
    { id: "ALL", label: "All", count: counts.ALL },
  ];

  return (
    <div className="page">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-wide text-slate-100">Alerts &amp; Emergencies</h2>
          <p className="text-sm text-slate-500">Active incidents, acknowledgements, and response jobs</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`chip ${filter === f.id ? "chip-on" : "chip-off"}`}
            >
              {f.label}
              <span className="ml-1.5 font-mono text-slate-500">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      {alerts.length === 0 ? (
        filter === "ACTIVE" || filter === "CRITICAL_ONLY" ? (
          <EmptyState
            tone="ok"
            title={filter === "ACTIVE" ? "No active alerts" : "No critical alerts"}
            hint="Everyone underground is within safe limits right now."
          />
        ) : (
          <EmptyState title="Nothing here yet" hint="Alerts will appear here as the simulation runs." />
        )
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {alerts.map((a) => (
            <AlertCard
              key={a.alert_id}
              alert={a}
              jobs={jobsByAlert[a.alert_id] ?? []}
              workerName={state.workers[a.worker_id]?.name}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AlertCard({
  alert: a,
  jobs,
  workerName,
}: {
  alert: Alert;
  jobs: Job[];
  workerName?: string;
}) {
  const minerLabel = workerName ? `${a.worker_id} · ${workerName}` : a.worker_id;

  return (
    <div
      className={`rounded-lg border border-border bg-panel2 p-4 border-l-4 ${
        a.severity === "CRITICAL" ? "border-status-critical" : "border-status-warning"
      } ${a.status === "RESOLVED" ? "opacity-50" : ""}`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] font-bold uppercase ${
              a.severity === "CRITICAL" ? "bg-status-critical/20 text-status-critical" : "bg-status-warning/20 text-status-warning"
            }`}
          >
            {a.severity}
          </span>
          <span className="text-sm font-medium text-slate-300">{alertTypeName(a.type)}</span>
        </div>
        <span className="text-[11px] uppercase tracking-wider text-slate-400">{a.status}</span>
      </div>

      <div className="mb-1 text-base font-semibold text-slate-100">
        <Link to={`/?track=${a.worker_id}`} className="hover:text-sky-300">
          {minerLabel}
        </Link>
        {" — "}
        {a.description}
      </div>
      <div className="mb-3 text-sm text-slate-400">
        <span className="text-slate-200">{placeName(a.location_zone_id)}</span>
        {" · "}
        raised at sim time <span className="font-mono text-slate-300">{formatSimTime(a.created_sim_ts)}</span>
        {a.value != null && (
          <>
            {" · "}
            reading <span className="font-mono text-slate-200">{a.value}</span>
            {a.threshold != null && <> (limit {a.threshold})</>}
          </>
        )}
      </div>

      {jobs.length > 0 && (
        <div className="mb-3 space-y-1 rounded border border-border/60 bg-panel p-2">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">Response jobs</div>
          {jobs.map((j) => (
            <div key={j.job_id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-slate-200">{j.title}</span>
              <span className="shrink-0 font-mono text-slate-500">{j.status}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {a.status === "ACTIVE" && (
          <button
            type="button"
            onClick={() => api.acknowledgeAlert(a.alert_id)}
            className="btn btn-secondary"
          >
            Acknowledge
          </button>
        )}
        <Link to={`/?track=${a.worker_id}`} className="btn btn-primary">
          Track miner
        </Link>
      </div>
    </div>
  );
}
