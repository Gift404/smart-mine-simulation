import type { Gateway } from "../types";

export default function GatewayStatus({ gateways }: { gateways: Record<string, Gateway> }) {
  const sorted = Object.values(gateways).sort((a, b) => a.gateway_id.localeCompare(b.gateway_id));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-panel2 p-4">
      <h2 className="mb-3 shrink-0 text-sm font-bold uppercase tracking-wide text-slate-300">Gateway Status</h2>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-2">
          {sorted.map((g) => (
            <div key={g.gateway_id} className="rounded border border-border/60 bg-panel px-2 py-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono font-semibold text-slate-100">{g.gateway_id}</span>
                <span className={g.status === "ONLINE" ? "text-status-normal" : "text-status-critical"}>
                  {g.status}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap justify-between gap-x-2 text-slate-500">
                <span>Primary: <span className={g.backhaul_primary === "ONLINE" ? "text-status-normal" : "text-status-critical"}>{g.backhaul_primary}</span></span>
                <span>Fallback: <span className={g.backhaul_fallback === "ONLINE" ? "text-status-normal" : "text-slate-500"}>{g.backhaul_fallback}</span></span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
