import type { Vehicle } from "../types";
import { vehicleKindLabel } from "./VehicleStatusCard";

export default function FleetPanel({
  vehicles, selectedVehicleId, trackedVehicleId, onSelectVehicle, onStartTracking, onStopTracking,
}: {
  vehicles: Record<string, Vehicle>;
  selectedVehicleId: string | null;
  trackedVehicleId: string | null;
  onSelectVehicle: (id: string) => void;
  onStartTracking: (id: string) => void;
  onStopTracking: () => void;
}) {
  const fleet = Object.values(vehicles).sort((a, b) => a.vehicle_id.localeCompare(b.vehicle_id));

  if (fleet.length === 0) return <p className="text-sm text-slate-500">No haulage vehicles in this simulation.</p>;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
      <div className="grid grid-cols-2 gap-2">
        {fleet.map((v) => {
          const tracking = v.vehicle_id === trackedVehicleId;
          const selected = v.vehicle_id === selectedVehicleId;
          const fill = Math.round(Math.max(0, Math.min(1, v.cargo_fill ?? 0)) * 100);
          return (
            <div
              key={v.vehicle_id}
              className={`rounded-md border p-2 text-left transition ${
                tracking
                  ? "border-sky-400/70 bg-panel ring-1 ring-sky-400/50"
                  : selected
                    ? "border-slate-300 bg-panel ring-1 ring-slate-400/40"
                    : "border-border/70 bg-panel hover:border-slate-500"
              }`}
            >
              <button type="button" onClick={() => onSelectVehicle(v.vehicle_id)} className="w-full text-left">
                <div className="truncate font-mono text-xs font-bold text-slate-100">{v.vehicle_id}</div>
                <div className="truncate text-[10px] text-slate-500">
                  {vehicleKindLabel(v)} · {v.driver_worker_id ? `${v.driver_worker_id} ${v.driver_name ?? ""}` : "no driver"}
                </div>
                <div className="truncate text-[10px] font-medium text-amber-300/90">{v.activity ?? v.phase}</div>
                <div className="mt-1 text-[10px] text-slate-400">
                  {v.level ?? "—"} · depth {Math.round(v.depth_m ?? v.y)} m
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500">
                  <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-800">
                    <div className="h-full rounded bg-amber-500" style={{ width: `${fill}%` }} />
                  </div>
                  <span className="w-8 text-right font-mono text-slate-300">{fill}%</span>
                </div>
                <div className="mt-0.5 text-[10px] text-slate-500">{v.load_cycles ?? 0} haul cycles</div>
              </button>
              <button
                type="button"
                onClick={() => (tracking ? onStopTracking() : onStartTracking(v.vehicle_id))}
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
        })}
      </div>
    </div>
  );
}
