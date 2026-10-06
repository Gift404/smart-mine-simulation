import type { Job } from "../types";

export default function JobPanel({ jobs }: { jobs: Record<string, Job> }) {
  const sorted = Object.values(jobs).sort((a, b) => b.created_sim_ts - a.created_sim_ts);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-panel2 p-4">
      <h2 className="mb-3 shrink-0 text-sm font-bold uppercase tracking-wide text-slate-300">Job / Response Engine</h2>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {sorted.length === 0 && <p className="text-sm text-slate-500">No active jobs.</p>}
        {sorted.map((j) => (
          <div key={j.job_id} className="rounded border border-border/60 bg-panel p-2 text-sm">
            <div className="flex justify-between">
              <span className="font-mono font-semibold text-slate-100">{j.job_id}</span>
              <span className="text-xs font-bold text-status-critical">{j.priority}</span>
            </div>
            <div className="text-slate-300">{j.title}</div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>{j.location_zone_id ?? j.location_edge_id}</span>
              <span>{j.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
