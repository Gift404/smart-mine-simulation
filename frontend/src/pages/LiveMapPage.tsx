import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import MineMap3D from "../components/MineMap3D";
import MineMap from "../components/MineMap";
import MineSection from "../components/MineSection";
import WorkerPanel from "../components/WorkerPanel";
import FleetPanel from "../components/FleetPanel";
import AlertFeed from "../components/AlertFeed";
import GatewayStatus from "../components/GatewayStatus";
import JobPanel from "../components/JobPanel";
import { useLive } from "../context/LiveDataContext";
import { api } from "../services/api";

type MapViewMode = "3d" | "section" | "2d";

const VIEW_STORAGE_KEY = "smart-mine-map-view";

const VIEW_MODES: { mode: MapViewMode; label: string; title: string }[] = [
  { mode: "3d", label: "3D", title: "Full 3D mine map" },
  { mode: "section", label: "Section", title: "Levels stacked by depth with shafts between them" },
  { mode: "2d", label: "2D plan", title: "Top-down plan of one level (east / north)" },
];

function loadViewMode(): MapViewMode {
  try {
    const v = localStorage.getItem(VIEW_STORAGE_KEY);
    if (v === "2d" || v === "3d" || v === "section") return v;
  } catch {
    /* ignore */
  }
  return "3d";
}

export default function LiveMapPage() {
  const {
    state, selectedWorkerId, trackingId,
    setSelectedWorkerId, startTracking, stopTracking,
    selectedVehicleId, trackedVehicleId, setSelectedVehicleId, startTrackingVehicle,
  } = useLive();
  const [params, setParams] = useSearchParams();
  const [focusGatewayId, setFocusGatewayId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<MapViewMode>(loadViewMode);
  const [sideTab, setSideTab] = useState<"miners" | "vehicles">("miners");

  // Picking a vehicle anywhere (map, search) brings the fleet list forward
  useEffect(() => {
    if (selectedVehicleId || trackedVehicleId) setSideTab("vehicles");
  }, [selectedVehicleId, trackedVehicleId]);
  useEffect(() => {
    if (trackingId) setSideTab("miners");
  }, [trackingId]);

  const vehicleProps = {
    vehicles: state.vehicles,
    selectedVehicleId,
    trackedVehicleId,
    onSelectVehicle: setSelectedVehicleId,
    onStartTrackingVehicle: startTrackingVehicle,
  };

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  useEffect(() => {
    const track = params.get("track");
    const vehicle = params.get("vehicle");
    const gateway = params.get("gateway");
    if (track && state.workers[track]) {
      startTracking(track);
      setFocusGatewayId(null);
      setParams({}, { replace: true });
      return;
    }
    if (vehicle && state.vehicles[vehicle]) {
      startTrackingVehicle(vehicle);
      setFocusGatewayId(null);
      setParams({}, { replace: true });
      return;
    }
    if (gateway && state.gateways[gateway]) {
      stopTracking();
      setFocusGatewayId(gateway);
      setParams({}, { replace: true });
    }
  }, [params, state.workers, state.vehicles, state.gateways, startTracking, startTrackingVehicle, stopTracking, setParams]);

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
    <div className="flex flex-col gap-3 p-3 sm:p-4 lg:h-full lg:min-h-0 lg:overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider text-slate-500">View</span>
        {VIEW_MODES.map(({ mode, label, title }) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={`rounded px-2.5 py-1 text-[11px] font-semibold ${
              viewMode === mode
                ? "bg-slate-600 text-white"
                : "bg-panel text-slate-400 hover:text-slate-200"
            }`}
            title={title}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:min-h-0 lg:flex-1 lg:overflow-hidden xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex h-[65dvh] min-h-[320px] flex-col overflow-hidden rounded-lg border border-border bg-panel2 p-2 lg:h-auto xl:min-h-0">
          {viewMode === "3d" ? (
            <MineMap3D
              key={state.mine?.simulation_id}
              mine={state.mine}
              workers={state.workers}
              {...vehicleProps}
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
          ) : viewMode === "section" ? (
            <MineSection
              key={state.mine?.simulation_id}
              mine={state.mine}
              workers={state.workers}
              {...vehicleProps}
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
              key={state.mine?.simulation_id}
              mine={state.mine}
              workers={state.workers}
              {...vehicleProps}
              geofences={state.geofences}
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

        <div className="flex max-h-[60dvh] min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-panel2 p-3 lg:max-h-[40vh] xl:max-h-none">
          <div className="mb-2 flex shrink-0 gap-1">
            {([
              ["miners", "Miners", Object.keys(state.workers).length],
              ["vehicles", "Vehicles", Object.keys(state.vehicles).length],
            ] as const).map(([tab, label, count]) => (
              <button
                key={tab}
                type="button"
                onClick={() => setSideTab(tab)}
                className={`rounded px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${
                  sideTab === tab ? "bg-slate-600 text-white" : "bg-panel text-slate-400 hover:text-slate-200"
                }`}
              >
                {label} <span className="ml-0.5 font-mono text-[11px] opacity-70">{count}</span>
              </button>
            ))}
          </div>
          {sideTab === "miners" ? (
            <WorkerPanel
              bare
              state={state}
              workerId={selectedWorkerId}
              trackingId={trackingId}
              onSelectWorker={setSelectedWorkerId}
              onStartTracking={startTracking}
              onStopTracking={stopTracking}
            />
          ) : (
            <FleetPanel
              vehicles={state.vehicles}
              selectedVehicleId={selectedVehicleId}
              trackedVehicleId={trackedVehicleId}
              onSelectVehicle={setSelectedVehicleId}
              onStartTracking={startTrackingVehicle}
              onStopTracking={stopTracking}
            />
          )}
        </div>
      </div>

      <div className="grid shrink-0 auto-rows-[15rem] grid-cols-1 gap-3 sm:grid-cols-3 lg:h-[min(220px,28vh)] lg:min-h-0 lg:auto-rows-auto">
        <AlertFeed alerts={state.alerts} />
        <GatewayStatus gateways={state.gateways} />
        <JobPanel jobs={state.jobs} />
      </div>
    </div>
  );
}
