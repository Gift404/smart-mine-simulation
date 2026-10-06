import { useState } from "react";
import type { Telemetry, SignalSample } from "../types";
import { bestRssiSeries } from "../utils/rssiSeries";

const RANGES = [
  { label: "5 min", seconds: 300 },
  { label: "15 min", seconds: 900 },
  { label: "30 min", seconds: 1800 },
  { label: "1 hour", seconds: 3600 },
];

const METRICS: { key: keyof Telemetry; label: string; unit: string; color: string; decimals?: number }[] = [
  { key: "hr", label: "Heart Rate", unit: "bpm", color: "#f13c3c" },
  { key: "bp_sys", label: "BP Systolic", unit: "mmHg", color: "#fb7185" },
  { key: "spo2", label: "SpO2", unit: "%", color: "#3b82f6" },
  { key: "o2_ambient", label: "Ambient O2", unit: "%", color: "#2fd47b" },
  { key: "ch4_lel", label: "Methane", unit: "LEL", color: "#f5a524", decimals: 2 },
  { key: "battery_pct", label: "Battery", unit: "%", color: "#a78bfa" },
];

interface Props {
  workerId: string | null;
  workerName?: string;
  history: Telemetry[];
  signalHistory: SignalSample[];
  simTimeS: number;
}

export default function AnalyticsPanel({ workerId, workerName, history, signalHistory, simTimeS }: Props) {
  const [rangeSeconds, setRangeSeconds] = useState(300);

  if (!workerId) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-panel2 p-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-300">Telemetry Analytics</h2>
        <p className="text-sm text-slate-500">Select a worker to see live charts.</p>
      </div>
    );
  }

  const windowed = history.filter((t) => t.ts >= simTimeS - rangeSeconds);
  const rssiWindowed = signalHistory.filter((s) => s.ts >= simTimeS - rangeSeconds);
  const rssiSeries = bestRssiSeries(rssiWindowed);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-panel2 p-4">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <h2 className="truncate text-sm font-bold uppercase tracking-wide text-slate-300">
          Telemetry Analytics {workerName ? `— ${workerName}` : ""}
        </h2>
        <div className="flex shrink-0 gap-1">
          {RANGES.map((r) => (
            <button
              key={r.seconds}
              onClick={() => setRangeSeconds(r.seconds)}
              className={`rounded px-2 py-0.5 text-xs ${
                rangeSeconds === r.seconds ? "bg-slate-600 text-slate-100" : "bg-panel text-slate-400"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {windowed.length < 2 ? (
        <p className="text-sm text-slate-500">Waiting for enough telemetry in this window…</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-auto sm:grid-cols-4 lg:grid-cols-7">
          {METRICS.map((m) => (
            <Sparkline key={m.key} label={m.label} unit={m.unit} color={m.color}
                       values={windowed.map((d) => Number(d[m.key]))}
                       decimals={m.decimals ?? 0} />
          ))}
          <Sparkline
            label="Best RSSI"
            unit="dBm"
            color="#38bdf8"
            values={rssiSeries.length >= 2 ? rssiSeries : windowed.map(() => -120)}
            decimals={0}
          />
        </div>
      )}
    </div>
  );
}

function Sparkline({
  label, unit, color, values, decimals,
}: {
  label: string;
  unit: string;
  color: string;
  values: number[];
  decimals: number;
}) {
  if (values.length < 2) {
    return (
      <div className="flex min-h-[72px] flex-col rounded border border-border/60 bg-panel p-2">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
        <span className="mt-2 text-xs text-slate-600">n/a</span>
      </div>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 100, h = 40;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const latest = values[values.length - 1];

  return (
    <div className="flex min-h-[72px] flex-col rounded border border-border/60 bg-panel p-2">
      <div className="mb-1 flex items-baseline justify-between gap-1">
        <span className="truncate text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
        <span className="shrink-0 font-mono text-xs font-semibold text-slate-100">
          {latest.toFixed(decimals)} {unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-full" preserveAspectRatio="none">
        <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} />
      </svg>
    </div>
  );
}
