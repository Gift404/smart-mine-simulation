import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { Worker, ScenarioName } from "../types";
import { SCENARIOS } from "../types";

const SPEEDS = [0.5, 1, 2, 5, 10];
const FALLBACK_ZONES = ["VERT_WEST", "VERT_EAST", "HORIZ_NORTH", "HORIZ_MID", "HORIZ_SOUTH"];

export default function ControlPanel({
  workers,
  running,
  zones,
  gatewayIds,
}: {
  workers: Record<string, Worker>;
  running: boolean;
  zones?: string[];
  gatewayIds?: string[];
}) {
  const workerIds = Object.keys(workers);
  const [selectedWorker, setSelectedWorker] = useState<string>(workerIds[0] ?? "");
  const zoneList = zones && zones.length > 0 ? zones : FALLBACK_ZONES;
  const [selectedZone, setSelectedZone] = useState<string>(zoneList[0] ?? "");
  const gwList = gatewayIds && gatewayIds.length > 0 ? gatewayIds : [];
  const [selectedGateway, setSelectedGateway] = useState<string>("");

  useEffect(() => {
    if (!selectedWorker && workerIds.length > 0) setSelectedWorker(workerIds[0]);
  }, [workerIds, selectedWorker]);

  useEffect(() => {
    if (!selectedZone && zoneList.length > 0) setSelectedZone(zoneList[0]);
  }, [zoneList, selectedZone]);

  useEffect(() => {
    if ((!selectedGateway || !gwList.includes(selectedGateway)) && gwList.length > 0) {
      setSelectedGateway(gwList[0]);
    }
  }, [gwList, selectedGateway]);

  return (
    <div className="rounded-lg border border-border bg-panel2 p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-300">Simulation Control</h2>

      <div className="mb-3 flex gap-2">
        <button onClick={() => api.start()} disabled={running}
                className="flex-1 rounded bg-status-normal/20 px-2 py-1.5 text-sm font-semibold text-status-normal disabled:opacity-40">
          START
        </button>
        <button onClick={() => api.pause()} disabled={!running}
                className="flex-1 rounded bg-status-warning/20 px-2 py-1.5 text-sm font-semibold text-status-warning disabled:opacity-40">
          PAUSE
        </button>
        <button onClick={() => api.reset()}
                className="flex-1 rounded bg-slate-700/50 px-2 py-1.5 text-sm font-semibold text-slate-300">
          RESET
        </button>
      </div>

      <div className="mb-4">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Speed</div>
        <div className="flex gap-1">
          {SPEEDS.map((s) => (
            <button key={s} onClick={() => api.setSpeed(s)}
                    className="flex-1 rounded bg-panel px-1 py-1 text-xs text-slate-300 hover:bg-slate-700">
              {s}x
            </button>
          ))}
        </div>
      </div>

      <div className="mb-2">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Target Worker</div>
        <select value={selectedWorker} onChange={(e) => setSelectedWorker(e.target.value)}
                className="w-full rounded bg-panel px-2 py-1 text-sm text-slate-200">
          {Object.values(workers).map((w) => (
            <option key={w.worker_id} value={w.worker_id}>{w.worker_id} — {w.name}</option>
          ))}
        </select>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-1.5">
        {SCENARIOS.map((s) => (
          <button
            key={s}
            disabled={!selectedWorker}
            onClick={() => api.triggerScenario(s as ScenarioName, selectedWorker)}
            className={`rounded px-2 py-1.5 text-xs font-semibold ${
              s === "clear" ? "bg-slate-700 text-slate-200" : "bg-status-critical/20 text-status-critical"
            } disabled:opacity-40`}
          >
            {labelFor(s)}
          </button>
        ))}
      </div>

      <div className="mb-3 border-t border-border/60 pt-3">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Zone Gas Event</div>
        <select value={selectedZone} onChange={(e) => setSelectedZone(e.target.value)}
                className="mb-1.5 w-full rounded bg-panel px-2 py-1 text-sm text-slate-200">
          {zoneList.map((z) => (
            <option key={z} value={z}>{z}</option>
          ))}
        </select>
        <button
          disabled={!selectedZone}
          onClick={() => api.triggerZoneGas(selectedZone)}
          className="w-full rounded bg-status-warning/20 px-2 py-1.5 text-xs font-semibold text-status-warning disabled:opacity-40"
        >
          Trigger Zone Methane
        </button>
      </div>

      <div className="border-t border-border/60 pt-3">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Backhaul Failure</div>
        <select value={selectedGateway} onChange={(e) => setSelectedGateway(e.target.value)}
                className="mb-1.5 w-full rounded bg-panel px-2 py-1 text-sm text-slate-200">
          {gwList.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
        <div className="flex gap-1.5">
          <button
            disabled={!selectedGateway}
            onClick={() => api.setBackhaulFailure(selectedGateway, true)}
            className="flex-1 rounded bg-status-critical/20 px-2 py-1.5 text-xs font-semibold text-status-critical disabled:opacity-40"
          >
            Fail Primary
          </button>
          <button
            disabled={!selectedGateway}
            onClick={() => api.setBackhaulFailure(selectedGateway, false)}
            className="flex-1 rounded bg-status-normal/20 px-2 py-1.5 text-xs font-semibold text-status-normal disabled:opacity-40"
          >
            Restore
          </button>
        </div>
      </div>
    </div>
  );
}

function labelFor(scenario: string): string {
  const labels: Record<string, string> = {
    low_spo2: "Trigger Low SpO2",
    high_hr: "Trigger High HR",
    low_o2: "Trigger Low O2",
    methane: "Trigger Methane",
    fall: "Trigger Fall",
    panic: "Trigger Panic",
    clear: "Clear Event",
  };
  return labels[scenario] ?? scenario;
}
