import type { LiveState } from "../hooks/useLiveData";
import type { Worker, Telemetry, PositionEstimate, Alert } from "../types";
import { STATUS_COLOR, workerDisplayStatus, type DisplayStatus } from "../services/status";

export default function WorkerPanel({
  state,
  workerId,
  trackingId,
  onSelectWorker,
  onStartTracking,
  onStopTracking,
  bare = false,
}: {
  state: LiveState;
  workerId: string | null;
  trackingId: string | null;
  onSelectWorker: (id: string) => void;
  onStartTracking: (id: string) => void;
  onStopTracking: () => void;
  /** Render only the miner list, for embedding in another panel */
  bare?: boolean;
}) {
  const workers = Object.values(state.workers).sort((a, b) => a.worker_id.localeCompare(b.worker_id));

  const list = workers.length === 0 ? (
    <p className="text-sm text-slate-500">Waiting for worker roster…</p>
  ) : (
    <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
      <div className="grid grid-cols-2 gap-2">
        {workers.map((w) => (
          <MinerCard
            key={w.worker_id}
            worker={w}
            telemetry={state.telemetryByTag[w.wearable_id]}
            position={state.positionByTag[w.wearable_id]}
            alerts={state.alerts}
            selected={w.worker_id === workerId}
            tracking={w.worker_id === trackingId}
            onSelect={() => onSelectWorker(w.worker_id)}
            onTrack={() => onStartTracking(w.worker_id)}
            onStopTrack={onStopTracking}
          />
        ))}
      </div>
    </div>
  );

  if (bare) return list;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-panel2 p-3">
      <div className="mb-2 flex shrink-0 items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-300">Miners</h2>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{workers.length} underground</span>
      </div>
      {list}
    </div>
  );
}

function MinerCard({
  worker,
  telemetry,
  position,
  alerts,
  selected,
  tracking,
  onSelect,
  onTrack,
  onStopTrack,
}: {
  worker: Worker;
  telemetry?: Telemetry;
  position?: PositionEstimate;
  alerts: Record<string, Alert>;
  selected: boolean;
  tracking: boolean;
  onSelect: () => void;
  onTrack: () => void;
  onStopTrack: () => void;
}) {
  const status = workerDisplayStatus(worker, alerts);

  return (
    <div
      className={`rounded-md border p-2 text-left transition ${
        tracking
          ? "border-sky-400/70 bg-panel ring-1 ring-sky-400/50"
          : selected
            ? "border-slate-300 bg-panel ring-1 ring-slate-400/40"
            : "border-border/70 bg-panel hover:border-slate-500"
      }`}
    >
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="mb-1.5 flex items-start justify-between gap-1">
          <div className="min-w-0">
            <div className="truncate font-mono text-xs font-bold text-slate-100">
              {worker.worker_id} · {worker.name}
            </div>
            <div className="truncate text-[10px] text-slate-500">{worker.role}</div>
            {worker.activity && worker.activity !== "Transit" && (
              <div className="truncate text-[10px] font-medium text-amber-300/90">{worker.activity}</div>
            )}
          </div>
          <StatusPill status={status} />
        </div>

        <div className="mb-1.5 space-y-0.5 text-[10px] text-slate-400">
          <div>
            {worker.level ?? "—"} · depth {Math.round(worker.depth_m ?? worker.y)} m
            {worker.mode === "burst" ? " · BURST" : ""}
          </div>
          {worker.watch_vibrating && (
            <div className="animate-pulse font-semibold text-rose-400">
              Watch vibrating · {worker.geofence_name ?? "restricted zone"}
            </div>
          )}
          <div className="font-mono text-slate-500">
            x {worker.x.toFixed(0)} · z {(worker.z ?? 0).toFixed(0)} · {worker.current_tunnel ?? worker.current_edge_id}
          </div>
          {worker.nearest_gateway && (
            <div>GW {worker.nearest_gateway}</div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
          <Vital label="HR" value={telemetry ? `${telemetry.hr}` : "—"} unit="bpm" />
          <Vital label="SpO₂" value={telemetry ? `${telemetry.spo2}` : "—"} unit="%" />
          <Vital
            label="BP"
            value={telemetry ? `${telemetry.bp_sys}/${telemetry.bp_dia}` : "—"}
            unit="mmHg"
          />
          <Vital label="Batt" value={telemetry ? `${Math.round(telemetry.battery_pct)}` : "—"} unit="%" />
          <Vital label="O₂" value={telemetry ? `${telemetry.o2_ambient}` : "—"} unit="%" />
          <Vital label="CH₄" value={telemetry ? `${telemetry.ch4_lel}` : "—"} unit="LEL" />
        </div>
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (tracking) onStopTrack();
          else onTrack();
        }}
        className={`mt-2 w-full rounded px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
          tracking
            ? "bg-sky-500/25 text-sky-200 hover:bg-sky-500/40"
            : "bg-slate-700/80 text-slate-200 hover:bg-slate-600"
        }`}
      >
        {tracking ? "Stop track" : "Track"}
      </button>
    </div>
  );
}

function Vital({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-wider text-slate-600">{label}</div>
      <div className="truncate font-mono text-[11px] font-semibold text-slate-200">
        {value}
        <span className="ml-0.5 font-sans text-[9px] font-normal text-slate-500">{unit}</span>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: DisplayStatus }) {
  return (
    <span
      className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
      style={{ background: STATUS_COLOR[status] + "33", color: STATUS_COLOR[status] }}
    >
      {status}
    </span>
  );
}
