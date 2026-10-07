import type { Vehicle } from "../types";

const PHASE_LABEL: Record<string, string> = {
  TRAVEL_TO_LOAD: "Empty, heading to load",
  LOADING: "Loading",
  TRAVEL_TO_DUMP: "Loaded, heading to tip",
  DUMPING: "Tipping",
  IDLE: "Idle",
};

export function vehicleKindLabel(v: Vehicle): string {
  return v.kind === "lhd" ? "LHD loader" : "Haul truck";
}

export default function VehicleStatusCard({
  vehicle, tracking, onClose, onTrack, onStopTrack, onSelectDriver,
}: {
  vehicle: Vehicle;
  tracking: boolean;
  onClose: () => void;
  onTrack: () => void;
  onStopTrack: () => void;
  onSelectDriver?: (workerId: string) => void;
}) {
  const fill = Math.round(Math.max(0, Math.min(1, vehicle.cargo_fill ?? 0)) * 100);
  return (
    <div
      className="absolute right-2 top-2 z-20 w-60 rounded-lg border border-border bg-[#121820]/95 p-3 shadow-xl backdrop-blur-sm"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-mono text-sm font-bold text-slate-100">
            {vehicle.vehicle_id} — {vehicle.name}
          </div>
          <div className="text-[11px] text-slate-400">{vehicleKindLabel(vehicle)}</div>
          <div className="mt-0.5 text-[11px] font-medium text-amber-300/90">
            {vehicle.activity ?? PHASE_LABEL[vehicle.phase] ?? vehicle.phase}
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded px-1 text-xs text-slate-400 hover:text-slate-200">
          ×
        </button>
      </div>
      <div className="mb-2 space-y-0.5 text-[11px] text-slate-400">
        <div>
          {vehicle.level ?? "—"} · depth {Math.round(vehicle.depth_m ?? vehicle.y)} m
        </div>
        <div className="font-mono text-slate-300">tunnel {vehicle.edge_id ?? vehicle.current_edge_id}</div>
        {vehicle.target_node_id && (
          <div>Heading to <span className="font-mono text-slate-200">{vehicle.target_node_id}</span></div>
        )}
        <div>
          Driver{" "}
          {vehicle.driver_worker_id ? (
            onSelectDriver ? (
              <button
                type="button"
                onClick={() => onSelectDriver(vehicle.driver_worker_id!)}
                className="font-mono text-sky-300 hover:underline"
              >
                {vehicle.driver_worker_id} · {vehicle.driver_name}
              </button>
            ) : (
              <span className="font-mono text-slate-200">{vehicle.driver_worker_id} · {vehicle.driver_name}</span>
            )
          ) : (
            <span className="text-slate-500">none</span>
          )}
        </div>
      </div>
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500">
        <span>Load</span>
        <span className="font-mono text-slate-300">{fill} %</span>
      </div>
      <div className="mb-2 h-1.5 overflow-hidden rounded bg-slate-800">
        <div className="h-full rounded bg-amber-500" style={{ width: `${fill}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="Speed" value={`${(vehicle.speed_mps * 3.6).toFixed(1)} km/h`} />
        <Stat label="Haul cycles" value={String(vehicle.load_cycles ?? 0)} />
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/50 bg-panel/80 px-1.5 py-1">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-mono text-xs font-semibold text-slate-100">{value}</div>
    </div>
  );
}
