import type { Alert, PositionEstimate, Telemetry, Worker } from "../types";
import { STATUS_COLOR, workerDisplayStatus } from "../services/status";

export default function WorkerStatusCard({
  worker, telemetry, position, alerts, tracking,
  onClose, onTrack, onStopTrack,
}: {
  worker: Worker;
  telemetry?: Telemetry;
  position?: PositionEstimate;
  alerts: Record<string, Alert>;
  tracking: boolean;
  onClose: () => void;
  onTrack: () => void;
  onStopTrack: () => void;
}) {
  const status = workerDisplayStatus(worker, alerts);
  return (
    <div
      className="absolute right-2 top-2 z-20 w-60 rounded-lg border border-border bg-[#121820]/95 p-3 shadow-xl backdrop-blur-sm"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-mono text-sm font-bold text-slate-100">
            {worker.worker_id} — {worker.name}
          </div>
          <div className="text-[11px] text-slate-400">{worker.role}</div>
          {worker.activity && (
            <div className="mt-0.5 text-[11px] font-medium text-amber-300/90">{worker.activity}</div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
            style={{ background: STATUS_COLOR[status] + "33", color: STATUS_COLOR[status] }}
          >
            {status}
          </span>
          <button type="button" onClick={onClose} className="rounded px-1 text-xs text-slate-400 hover:text-slate-200">
            ×
          </button>
        </div>
      </div>
      <div className="mb-2 space-y-0.5 text-[11px] text-slate-400">
        <div>
          {worker.level ?? "—"} · depth {Math.round(worker.depth_m ?? worker.y)} m
        </div>
        <div className="font-mono text-slate-300">
          tunnel {worker.current_tunnel ?? worker.current_edge_id}
          {worker.nearest_gateway ? ` · ${worker.nearest_gateway}` : ""}
        </div>
        {position?.zone_id && (
          <div>Zone <span className="font-mono text-slate-200">{position.zone_id}</span></div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <DetailStat label="Heart Rate" value={telemetry ? `${telemetry.hr} bpm` : "—"} />
        <DetailStat label="Blood Pressure" value={telemetry ? `${telemetry.bp_sys}/${telemetry.bp_dia}` : "—"} />
        <DetailStat label="SpO₂" value={telemetry ? `${telemetry.spo2} %` : "—"} />
        <DetailStat label="Ambient O₂" value={telemetry ? `${telemetry.o2_ambient} %` : "—"} />
        <DetailStat label="Methane" value={telemetry ? `${telemetry.ch4_lel} LEL` : "—"} />
        <DetailStat label="Battery" value={telemetry ? `${telemetry.battery_pct} %` : "—"} />
      </div>
      <button
        type="button"
        onClick={tracking ? onStopTrack : onTrack}
        className={`mt-2.5 w-full rounded px-2 py-1.5 text-xs font-semibold uppercase tracking-wider ${
          tracking
            ? "bg-sky-500/25 text-sky-200 hover:bg-sky-500/40"
            : "bg-slate-600/80 text-slate-100 hover:bg-slate-500"
        }`}
      >
        {tracking ? "Stop tracking" : "Track on map"}
      </button>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/50 bg-panel/80 px-1.5 py-1">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-mono text-xs font-semibold text-slate-100">{value}</div>
    </div>
  );
}
