import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useLiveData, type LiveState } from "../hooks/useLiveData";

interface LiveDataContextValue {
  state: LiveState;
  zones: string[];
  selectedWorkerId: string | null;
  trackingId: string | null;
  setSelectedWorkerId: (id: string | null) => void;
  startTracking: (id: string) => void;
  /** Stops tracking whatever is tracked — miner or vehicle */
  stopTracking: () => void;
  selectedVehicleId: string | null;
  trackedVehicleId: string | null;
  setSelectedVehicleId: (id: string | null) => void;
  startTrackingVehicle: (id: string) => void;
  switching: boolean;
  switchSimulation: (simulationId: string) => Promise<void>;
}

const LiveDataContext = createContext<LiveDataContextValue | null>(null);

export function LiveDataProvider({ children }: { children: ReactNode }) {
  const { state, switching, switchSimulation: switchLive } = useLiveData();
  const [selectedWorkerId, setSelectedWorker] = useState<string | null>(null);
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicle] = useState<string | null>(null);
  const [trackedVehicleId, setTrackedVehicleId] = useState<string | null>(null);

  const zones = useMemo(() => {
    if (state.mine?.zones?.length) return [...state.mine.zones].sort();
    return [...new Set((state.mine?.edges ?? []).map((e) => e.zone_id))].sort();
  }, [state.mine]);

  // Only one thing is selected (and one thing tracked) at a time
  const setSelectedWorkerId = useCallback((id: string | null) => {
    setSelectedWorker(id);
    if (id) setSelectedVehicle(null);
  }, []);
  const setSelectedVehicleId = useCallback((id: string | null) => {
    setSelectedVehicle(id);
    if (id) setSelectedWorker(null);
  }, []);

  const startTracking = useCallback((id: string) => {
    setSelectedWorker(id);
    setTrackingId(id);
    setSelectedVehicle(null);
    setTrackedVehicleId(null);
  }, []);
  const startTrackingVehicle = useCallback((id: string) => {
    setSelectedVehicle(id);
    setTrackedVehicleId(id);
    setSelectedWorker(null);
    setTrackingId(null);
  }, []);
  const stopTracking = useCallback(() => {
    setTrackingId(null);
    setTrackedVehicleId(null);
  }, []);

  const switchSimulation = useCallback(async (simulationId: string) => {
    setTrackingId(null);
    setSelectedWorker(null);
    setTrackedVehicleId(null);
    setSelectedVehicle(null);
    await switchLive(simulationId);
  }, [switchLive]);

  const value = useMemo(
    () => ({
      state,
      zones,
      selectedWorkerId,
      trackingId,
      setSelectedWorkerId,
      startTracking,
      stopTracking,
      selectedVehicleId,
      trackedVehicleId,
      setSelectedVehicleId,
      startTrackingVehicle,
      switching,
      switchSimulation,
    }),
    [
      state, zones, selectedWorkerId, trackingId, setSelectedWorkerId, startTracking, stopTracking,
      selectedVehicleId, trackedVehicleId, setSelectedVehicleId, startTrackingVehicle, switching, switchSimulation,
    ],
  );

  return <LiveDataContext.Provider value={value}>{children}</LiveDataContext.Provider>;
}

export function useLive() {
  const ctx = useContext(LiveDataContext);
  if (!ctx) throw new Error("useLive must be used within LiveDataProvider");
  return ctx;
}
