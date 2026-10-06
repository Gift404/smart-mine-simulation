import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useLiveData, type LiveState } from "../hooks/useLiveData";

interface LiveDataContextValue {
  state: LiveState;
  zones: string[];
  selectedWorkerId: string | null;
  trackingId: string | null;
  setSelectedWorkerId: (id: string | null) => void;
  startTracking: (id: string) => void;
  stopTracking: () => void;
}

const LiveDataContext = createContext<LiveDataContextValue | null>(null);

export function LiveDataProvider({ children }: { children: ReactNode }) {
  const state = useLiveData();
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [trackingId, setTrackingId] = useState<string | null>(null);

  const zones = useMemo(() => {
    if (state.mine?.zones?.length) return [...state.mine.zones].sort();
    return [...new Set((state.mine?.edges ?? []).map((e) => e.zone_id))].sort();
  }, [state.mine]);

  const startTracking = useCallback((id: string) => {
    setSelectedWorkerId(id);
    setTrackingId(id);
  }, []);
  const stopTracking = useCallback(() => setTrackingId(null), []);

  const value = useMemo(
    () => ({
      state,
      zones,
      selectedWorkerId,
      trackingId,
      setSelectedWorkerId,
      startTracking,
      stopTracking,
    }),
    [state, zones, selectedWorkerId, trackingId, startTracking, stopTracking],
  );

  return <LiveDataContext.Provider value={value}>{children}</LiveDataContext.Provider>;
}

export function useLive() {
  const ctx = useContext(LiveDataContext);
  if (!ctx) throw new Error("useLive must be used within LiveDataProvider");
  return ctx;
}
