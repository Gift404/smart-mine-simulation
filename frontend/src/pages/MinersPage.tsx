import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLive } from "../context/LiveDataContext";
import { STATUS_COLOR, workerDisplayStatus, type DisplayStatus } from "../services/status";
import type { Alert, PositionEstimate, Telemetry, Worker } from "../types";

type StatusFilter = "ALL" | DisplayStatus;

export default function MinersPage() {
  const { state, trackingId, startTracking, stopTracking, setSelectedWorkerId } = useLive();
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const navigate = useNavigate();

  const workers = useMemo(() => {
    let list = Object.values(state.workers).sort((a, b) => a.worker_id.localeCompare(b.worker_id));
    if (filter !== "ALL") {
      list = list.filter((w) => workerDisplayStatus(w, state.alerts) === filter);
    }
    return list;
  }, [state.workers, state.alerts, filter]);

  const trackOnMap = (id: string) => {
    startTracking(id);
    navigate(`/?track=${id}`);
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-wide text-slate-100">Miners</h2>
          <p className="text-sm text-slate-500">
            {Object.keys(state.workers).length} underground · live vitals and location
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {(["ALL", "CRITICAL", "WARNING", "NORMAL", "LOST"] as StatusFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${
                filter === f ? "bg-slate-600 text-slate-100" : "bg-panel2 text-slate-400 hover:text-slate-200"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {workers.map((w) => (
          <MinerDetailCard
            key={w.worker_id}
            worker={w}
            telemetry={state.telemetryByTag[w.wearable_id]}
            position={state.positionByTag[w.wearable_id]}
            alerts={state.alerts}
            tracking={w.worker_id === trackingId}
            onSelect={() => setSelectedWorkerId(w.worker_id)}
            onTrack={() => trackOnMap(w.worker_id)}
            onStopTrack={stopTracking}
          />
        ))}
      </div>
      {workers.length === 0 && (
        <div className="rounded-lg border border-border bg-panel2 p-8 text-center text-slate-500">
          No miners match this filter.
        </div>
      )}
    </div>
  );
}

function MinerDetailCard({
  worker, telemetry, position, alerts, tracking, onSelect, onTrack, onStopTrack,
}: {
  worker: Worker;
  telemetry?: Telemetry;
  position?: PositionEstimate;
  alerts: Record<string, Alert>;
  tracking: boolean;
  onSelect: () => void;
  onTrack: () => void;
  onStopTrack: () => void;
}) {
  const status = workerDisplayStatus(worker, alerts);
  const zone = position?.zone_id ?? worker.current_edge_id;
  const activeAlerts = Object.values(alerts).filter(
    (a) => a.worker_id === worker.worker_id && a.status !== "RESOLVED",
  );

  return (
    <div
      className={`rounded-lg border bg-panel2 p-4 transition ${
        tracking
          ? "border-sky-400/70 ring-1 ring-sky-400/40"
          : "border-border hover:border-slate-500"
      }`}
    >
      <button type="button" onClick={onSelect} className="mb-3 w-full text-left">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-mono text-sm font-bold text-slate-100">
              {worker.worker_id} · {worker.name}
            </div>
            <div className="truncate text-xs text-slate-500">{worker.role}</div>
          </div>
          <span
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
            style={{ background: STATUS_COLOR[status] + "33", color: STATUS_COLOR[status] }}
          >
            {status}
          </span>
        </div>
        <div className="text-xs text-slate-400">
          Zone <span className="font-mono text-slate-200">{zone}</span>
          {worker.mode === "burst" && <span className="ml-2 text-status-warning">BURST</span>}
          {worker.incapacitated && <span className="ml-2 text-status-critical">INCAPACITATED</span>}
        </div>
      </button>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <Stat label="HR" value={telemetry ? `${telemetry.hr}` : "—"} unit="bpm" />
        <Stat label="SpO₂" value={telemetry ? `${telemetry.spo2}` : "—"} unit="%" />
        <Stat label="BP" value={telemetry ? `${telemetry.bp_sys}/${telemetry.bp_dia}` : "—"} unit="" />
        <Stat label="O₂" value={telemetry ? `${telemetry.o2_ambient}` : "—"} unit="%" />
        <Stat label="CH₄" value={telemetry ? `${telemetry.ch4_lel}` : "—"} unit="LEL" />
        <Stat label="Batt" value={telemetry ? `${Math.round(telemetry.battery_pct)}` : "—"} unit="%" />
      </div>

      {activeAlerts.length > 0 && (
        <div className="mb-3 space-y-1">
          {activeAlerts.slice(0, 3).map((a) => (
            <div key={a.alert_id} className="truncate text-[11px] text-status-warning">
              {a.type}: {a.description}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={tracking ? onStopTrack : onTrack}
          className={`flex-1 rounded px-2 py-1.5 text-xs font-semibold uppercase tracking-wider ${
            tracking
              ? "bg-sky-500/25 text-sky-200 hover:bg-sky-500/40"
              : "bg-slate-700 text-slate-100 hover:bg-slate-600"
          }`}
        >
          {tracking ? "Stop track" : "Track on map"}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded border border-border/50 bg-panel px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-mono text-sm font-semibold text-slate-100">
        {value}
        {unit && <span className="ml-0.5 text-[10px] font-normal text-slate-500">{unit}</span>}
      </div>
    </div>
  );
}
