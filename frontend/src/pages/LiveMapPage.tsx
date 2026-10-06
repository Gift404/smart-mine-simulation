import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import MineMap3D from "../components/MineMap3D";
import MineMap from "../components/MineMap";
import WorkerPanel from "../components/WorkerPanel";
import AlertFeed from "../components/AlertFeed";
import GatewayStatus from "../components/GatewayStatus";
import JobPanel from "../components/JobPanel";
import { useLive } from "../context/LiveDataContext";
import { api } from "../services/api";

type MapViewMode = "3d" | "2d";

const VIEW_STORAGE_KEY = "smart-mine-map-view";

function loadViewMode(): MapViewMode {
  try {
    const v = localStorage.getItem(VIEW_STORAGE_KEY);
    if (v === "2d" || v === "3d") return v;
  } catch {
    /* ignore */
  }
  return "3d";
}

export default function LiveMapPage() {
  const {
    state, selectedWorkerId, trackingId,
    setSelectedWorkerId, startTracking, stopTracking,
  } = useLive();
  const [params, setParams] = useSearchParams();
  const [focusGatewayId, setFocusGatewayId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<MapViewMode>(loadViewMode);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  useEffect(() => {
    const track = params.get("track");
    const gateway = params.get("gateway");
    if (track && state.workers[track]) {
      startTracking(track);
      setFocusGatewayId(null);
      setParams({}, { replace: true });
      return;
    }
    if (gateway && state.gateways[gateway]) {
      stopTracking();
      setFocusGatewayId(gateway);
      setParams({}, { replace: true });
    }
  }, [params, state.workers, state.gateways, startTracking, stopTracking, setParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await api.setSpeed(5);
        const status = await api.status();
        if (!cancelled && !status.running) {
          await api.start();
        }
      } catch {
        /* backend may still be warming up */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-3 sm:p-4">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">View</span>
        {(
          [
            ["3d", "3D"],
            ["2d", "2D plan"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={`rounded px-2.5 py-1 text-[11px] font-semibold ${
              viewMode === mode
                ? "bg-slate-600 text-white"
                : "bg-panel text-slate-400 hover:text-slate-200"
            }`}
            title={mode === "3d" ? "Full 3D mine map" : "Flat plan view (east / north)"}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-h-[240px] flex-col overflow-hidden rounded-lg border border-border bg-panel2 p-2 sm:min-h-[320px] xl:min-h-0">
          {viewMode === "3d" ? (
            <MineMap3D
              mine={state.mine}
              workers={state.workers}
              vehicles={state.vehicles}
              gateways={state.gateways}
              alerts={state.alerts}
              geofences={state.geofences}
              telemetryByTag={state.telemetryByTag}
              positionByTag={state.positionByTag}
              selectedWorkerId={selectedWorkerId}
              trackingId={trackingId}
              focusGatewayId={focusGatewayId}
              onSelectWorker={setSelectedWorkerId}
              onStartTracking={startTracking}
              onStopTracking={stopTracking}
            />
          ) : (
            <MineMap
              mine={state.mine}
              workers={state.workers}
              gateways={state.gateways}
              alerts={state.alerts}
              telemetryByTag={state.telemetryByTag}
              positionByTag={state.positionByTag}
              selectedWorkerId={selectedWorkerId}
              trackingId={trackingId}
              focusGatewayId={focusGatewayId}
              onSelectWorker={setSelectedWorkerId}
              onStartTracking={startTracking}
              onStopTracking={stopTracking}
            />
          )}
        </div>

        <div className="flex max-h-[40vh] min-h-0 flex-col overflow-hidden xl:max-h-none">
          <WorkerPanel
            state={state}
            workerId={selectedWorkerId}
            trackingId={trackingId}
            onSelectWorker={setSelectedWorkerId}
            onStartTracking={startTracking}
            onStopTracking={stopTracking}
          />
        </div>
      </div>

      <div className="grid min-h-0 shrink-0 grid-cols-1 gap-3 sm:grid-cols-3" style={{ height: "min(220px, 28vh)" }}>
        <AlertFeed alerts={state.alerts} />
        <GatewayStatus gateways={state.gateways} />
        <JobPanel jobs={state.jobs} />
      </div>
    </div>
  );
}
