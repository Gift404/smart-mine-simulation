import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useLive } from "../context/LiveDataContext";
import { workerDisplayStatus, STATUS_COLOR } from "../services/status";
import { vehicleKindLabel } from "./VehicleStatusCard";

type Result = { kind: "miner" | "vehicle" | "gateway"; id: string; title: string; subtitle: string };

const BADGE: Record<Result["kind"], { label: string; className: string }> = {
  miner: { label: "Miner", className: "bg-emerald-500/20 text-emerald-300" },
  vehicle: { label: "Vehicle", className: "bg-amber-500/20 text-amber-300" },
  gateway: { label: "GW", className: "bg-blue-500/20 text-blue-300" },
};

export default function GlobalSearch() {
  const { state, startTracking, startTrackingVehicle, stopTracking } = useLive();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [] as Result[];

    const miners: Result[] = Object.values(state.workers)
      .filter((w) => {
        const hay = [w.worker_id, w.name, w.role].join(" ").toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => a.worker_id.localeCompare(b.worker_id))
      .slice(0, 8)
      .map((w) => {
        const status = workerDisplayStatus(w, state.alerts);
        const zone = state.positionByTag[w.wearable_id]?.zone_id ?? w.current_edge_id;
        return {
          kind: "miner" as const,
          id: w.worker_id,
          title: w.worker_id + " · " + w.name,
          subtitle: w.role + " · " + zone + " · " + status,
        };
      });

    const vehicles: Result[] = Object.values(state.vehicles)
      .filter((v) => {
        const hay = [v.vehicle_id, v.name, v.kind, vehicleKindLabel(v), v.driver_worker_id, v.driver_name, "truck"]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => a.vehicle_id.localeCompare(b.vehicle_id))
      .slice(0, 8)
      .map((v) => ({
        kind: "vehicle" as const,
        id: v.vehicle_id,
        title: v.vehicle_id + (v.name && v.name !== v.vehicle_id ? " · " + v.name : ""),
        subtitle:
          vehicleKindLabel(v) + " · " + (v.driver_name ?? "no driver") + " · " + (v.level ?? "in transit") + " · " + (v.activity ?? v.phase),
      }));

    const gateways: Result[] = Object.values(state.gateways)
      .filter((g) => {
        const hay = [g.gateway_id, g.zone_id, g.status].join(" ").toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => a.gateway_id.localeCompare(b.gateway_id))
      .slice(0, 8)
      .map((g) => ({
        kind: "gateway" as const,
        id: g.gateway_id,
        title: g.gateway_id,
        subtitle: g.zone_id + " · " + g.status,
      }));

    return [...miners, ...vehicles, ...gateways];
  }, [query, state.workers, state.vehicles, state.gateways, state.alerts, state.positionByTag]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const select = (r: Result) => {
    setQuery("");
    setOpen(false);
    if (r.kind === "miner") {
      startTracking(r.id);
      navigate("/?track=" + encodeURIComponent(r.id));
    } else if (r.kind === "vehicle") {
      startTrackingVehicle(r.id);
      navigate("/?vehicle=" + encodeURIComponent(r.id));
    } else {
      stopTracking();
      navigate("/?gateway=" + encodeURIComponent(r.id));
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter") && results.length) {
      setOpen(true);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(results[activeIdx] ?? results[0]);
    }
  };

  return (
    <div ref={rootRef} className="relative w-full">
      <label className="sr-only" htmlFor="global-search">
        Search miners, vehicles or gateways
      </label>
      <input
        id="global-search"
        ref={inputRef}
        type="search"
        value={query}
        placeholder="Search miner, vehicle or gateway…"
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full rounded border border-border bg-panel px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-500"
      />
      {open && query.trim().length > 0 && (
        <div className="absolute right-0 z-50 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-border bg-[#121820] shadow-xl">
          {results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-500">No matches</div>
          ) : (
            <ul className="py-1">
              {results.map((r, i) => {
                const worker = r.kind === "miner" ? state.workers[r.id] : null;
                const status = worker ? workerDisplayStatus(worker, state.alerts) : null;
                return (
                  <li key={r.kind + "-" + r.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIdx(i)}
                      onClick={() => select(r)}
                      className={
                        "flex w-full items-start gap-2 px-3 py-2 text-left text-sm " +
                        (i === activeIdx ? "bg-slate-700/80" : "hover:bg-panel")
                      }
                    >
                      <span
                        className={
                          "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider " +
                          BADGE[r.kind].className
                        }
                      >
                        {BADGE[r.kind].label}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-mono font-semibold text-slate-100">{r.title}</span>
                          {status && (
                            <span
                              className="shrink-0 text-[9px] font-bold uppercase"
                              style={{ color: STATUS_COLOR[status] }}
                            >
                              {status}
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-slate-500">{r.subtitle}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
