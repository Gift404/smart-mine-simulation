import type { SimulationStatus } from "../types";
import { formatSimTime } from "../services/status";
import GlobalSearch from "./GlobalSearch";
import SimulationToggle from "./SimulationToggle";

export default function Header({ status }: { status: SimulationStatus | null }) {
  return (
    <header className="shrink-0 border-b border-border bg-panel px-4 py-2.5 sm:px-6 sm:py-3">
      <div className="flex flex-col gap-2 sm:gap-3 lg:flex-row lg:items-center lg:gap-6">
        <div className="min-w-0 shrink-0 lg:w-56 xl:w-64">
          <h1 className="truncate text-base font-bold tracking-tight text-slate-100 sm:text-lg">
            Platreef Safety Simulation
          </h1>
          <SimulationToggle />
        </div>

        <div className="grid min-w-0 flex-1 grid-cols-3 gap-2 rounded-lg border border-border/60 bg-panel2/80 px-2 py-2 sm:grid-cols-6 sm:gap-3 sm:px-3">
          <Metric
            label="Status"
            value={status?.running ? "Running" : "Paused"}
            accent={status?.running ? "text-status-normal" : "text-slate-400"}
          />
          <Metric label="Sim time" value={status ? formatSimTime(status.sim_time_s) : "--:--:--"} wide />
          <Metric label="Miners" value={String(status?.workers ?? "-")} wide />
          <Metric label="Haulage" value={String(status?.vehicles ?? "-")} wide />
          <Metric
            label="Alerts"
            value={String(status?.active_alerts ?? 0)}
            accent={status && status.active_alerts > 0 ? "text-status-warning" : ""}
          />
          <Metric
            label="Gateways"
            value={status ? `${status.gateways_online}/${status.gateways_total}` : "-"}
            accent={
              status && status.gateways_online < status.gateways_total
                ? "text-status-critical"
                : "text-status-normal"
            }
          />
        </div>

        <div className="w-full shrink-0 lg:w-64 xl:w-72">
          <GlobalSearch />
        </div>
      </div>
    </header>
  );
}

/** `wide` metrics are secondary and hidden on phones to keep the header to one row */
function Metric({ label, value, accent, wide = false }: { label: string; value: string; accent?: string; wide?: boolean }) {
  return (
    <div className={`min-w-0 text-center ${wide ? "hidden sm:block" : ""}`}>
      <div className="truncate text-[10px] uppercase tracking-wider text-slate-400 sm:text-[11px]">{label}</div>
      <div className={`truncate font-mono text-xs font-semibold sm:text-sm ${accent ?? "text-slate-100"}`}>
        {value}
      </div>
    </div>
  );
}
