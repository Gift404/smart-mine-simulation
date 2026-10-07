import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLive } from "../context/LiveDataContext";
import { STATUS_COLOR, workerDisplayStatus, type DisplayStatus } from "../services/status";
import { alertTypeName, placeName } from "../services/labels";
import EmptyState from "../components/EmptyState";
import type { Alert, PositionEstimate, Telemetry, Worker } from "../types";

type StatusFilter = "ALL" | DisplayStatus;

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "CRITICAL", label: "Critical" },
  { id: "WARNING", label: "Warning" },
  { id: "LOST", label: "Lost" },
  { id: "NORMAL", label: "Normal" },
];

/** Problems first: critical, then lost signal, then warnings, then everyone else */
const STATUS_RANK: Record<DisplayStatus, number> = { CRITICAL: 0, LOST: 1, WARNING: 2, NORMAL: 3 };

export default function MinersPage() {
  const { state, trackingId, startTracking, stopTracking, setSelectedWorkerId } = useLive();
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const statusById = useMemo(() => {
    const m: Record<string, DisplayStatus> = {};
    for (const w of Object.values(state.workers)) m[w.worker_id] = workerDisplayStatus(w, state.alerts);
    return m;
  }, [state.workers, state.alerts]);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { ALL: 0, CRITICAL: 0, WARNING: 0, LOST: 0, NORMAL: 0 };
    for (const s of Object.values(statusById)) {
      c.ALL += 1;
      c[s] += 1;
    }
    return c;
  }, [statusById]);

  const workers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(state.workers)
      .filter((w) => filter === "ALL" || statusById[w.worker_id] === filter)
      .filter((w) => {
        if (!q) return true;
        const zone = state.positionByTag[w.wearable_id]?.zone_id ?? "";
        return [w.worker_id, w.name, w.role, placeName(zone)].join(" ").toLowerCase().includes(q);
      })
      .sort(
        (a, b) =>
          STATUS_RANK[statusById[a.worker_id]] - STATUS_RANK[statusById[b.worker_id]] ||
          a.worker_id.localeCompare(b.worker_id),
      );
  }, [state.workers, state.positionByTag, statusById, filter, query]);

  const trackOnMap = (id: string) => {
    startTracking(id);
    navigate(`/?track=${id}`);
  };

  return (
    <div className="page">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-wide text-slate-100">Miners</h2>
          <p className="text-sm text-slate-500">
            {Object.keys(state.workers).length} underground · problems listed first
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find by name, role or place…"
            className="w-full rounded sm:w-56 border border-border bg-panel px-3 py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-slate-500"
          />
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`chip ${filter === f.id ? "chip-on" : "chip-off"}`}
              >
                {f.label}
                <span className="ml-1.5 font-mono text-slate-500">{counts[f.id]}</span>
              </button>
            ))}
          </div>
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
      {workers.length === 0 &&
        (query ? (
          <EmptyState title={`No miners match “${query}”`} hint="Try a name, a role such as “driller”, or a place such as “shaft”." />
        ) : (
          <EmptyState
            tone={filter === "NORMAL" ? "neutral" : "ok"}
            title={filter === "NORMAL" ? "No miners are in normal condition" : "No miners with this status right now"}
            hint={filter === "ALL" ? "Waiting for miners to report in…" : undefined}
          />
        ))}
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
  const zone = placeName(position?.zone_id);
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
            className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold uppercase"
            style={{ background: STATUS_COLOR[status] + "33", color: STATUS_COLOR[status] }}
          >
            {status}
          </span>
        </div>
        <div className="text-sm text-slate-300">
          {zone}
          {worker.mode === "burst" && <span className="ml-2 text-xs text-status-warning">Fast reporting</span>}
          {worker.incapacitated && <span className="ml-2 text-xs font-semibold text-status-critical">Incapacitated</span>}
        </div>
      </button>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <Stat label="HR" value={telemetry ? `${telemetry.hr}` : "—"} unit="bpm" />
        <Stat label="SpO₂" value={telemetry ? `${telemetry.spo2}` : "—"} unit="%" />
        <Stat label="BP" value={telemetry ? `${telemetry.bp_sys}/${telemetry.bp_dia}` : "—"} unit="" />
        <Stat label="O₂" value={telemetry ? `${telemetry.o2_ambient}` : "—"} unit="%" />
        <Stat label="CH₄" value={telemetry ? `${telemetry.ch4_lel}` : "—"} unit="LEL" />
        <Stat label="Battery" value={telemetry ? `${Math.round(telemetry.battery_pct)}` : "—"} unit="%" />
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-0.5">
          {activeAlerts.length === 0 ? (
            <div className="text-xs text-slate-500">No active alerts</div>
          ) : (
            activeAlerts.slice(0, 3).map((a) => (
              <div key={a.alert_id} className="truncate text-xs text-status-warning">
                {alertTypeName(a.type)}: {a.description}
              </div>
            ))
          )}
        </div>
        <button
          type="button"
          onClick={tracking ? onStopTrack : onTrack}
          className={`btn btn-sm shrink-0 ${tracking ? "btn-active" : "btn-ghost"}`}
        >
          {tracking ? "Stop tracking" : "Track on map"}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded border border-border/50 bg-panel px-2 py-1.5">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="font-mono text-base font-semibold text-slate-100">
        {value}
        {unit && <span className="ml-0.5 text-xs font-normal text-slate-500">{unit}</span>}
      </div>
    </div>
  );
}
