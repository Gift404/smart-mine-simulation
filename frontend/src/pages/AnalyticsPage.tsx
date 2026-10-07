import { useMemo, useState } from "react";
import { useLive } from "../context/LiveDataContext";
import { placeName } from "../services/labels";
import type { Telemetry } from "../types";

const RANGES = [
  { label: "5 min", seconds: 300 },
  { label: "15 min", seconds: 900 },
  { label: "30 min", seconds: 1800 },
  { label: "1 hour", seconds: 3600 },
];

type SeriesKey = "ch4" | "o2" | "hr" | "spo2" | "battery" | "minSpo2";

const CHARTS: {
  key: SeriesKey;
  title: string;
  subtitle: string;
  unit: string;
  color: string;
  decimals: number;
  warn?: (latest: number) => string | null;
}[] = [
  {
    key: "ch4",
    title: "Methane (CH₄)",
    subtitle: "Fleet average — lower is safer",
    unit: "LEL",
    color: "#f5a524",
    decimals: 2,
    warn: (v) => (v >= 10 ? "Elevated methane — check ventilation" : null),
  },
  {
    key: "o2",
    title: "Ambient oxygen",
    subtitle: "Fleet average — should stay near 21%",
    unit: "%",
    color: "#2fd47b",
    decimals: 2,
    warn: (v) => (v < 19.5 ? "Oxygen below safe range" : null),
  },
  {
    key: "hr",
    title: "Heart rate",
    subtitle: "Fleet average",
    unit: "bpm",
    color: "#f13c3c",
    decimals: 0,
    warn: (v) => (v > 120 ? "High average heart rate" : null),
  },
  {
    key: "spo2",
    title: "Blood oxygen (SpO₂)",
    subtitle: "Fleet average",
    unit: "%",
    color: "#3b82f6",
    decimals: 0,
    warn: (v) => (v < 94 ? "SpO₂ trending low" : null),
  },
  {
    key: "minSpo2",
    title: "Lowest SpO₂",
    subtitle: "Worst miner in each time slice",
    unit: "%",
    color: "#38bdf8",
    decimals: 0,
    warn: (v) => (v < 90 ? "At least one miner critically low" : null),
  },
  {
    key: "battery",
    title: "Wearable battery",
    subtitle: "Fleet average",
    unit: "%",
    color: "#a78bfa",
    decimals: 0,
    warn: (v) => (v < 25 ? "Batteries running low" : null),
  },
];

export default function AnalyticsPage() {
  const { state, zones } = useLive();
  const [rangeSeconds, setRangeSeconds] = useState(900);
  const simTimeS = state.status?.sim_time_s ?? 0;

  const mineSeries = useMemo(
    () => buildMineSeries(state.telemetryHistoryByTag, simTimeS, rangeSeconds),
    [state.telemetryHistoryByTag, simTimeS, rangeSeconds],
  );

  const zoneSnapshots = useMemo(() => {
    const edgeZone: Record<string, string> = {};
    for (const e of state.mine?.edges ?? []) edgeZone[e.id] = e.zone_id;

    return zones.map((zoneId) => {
      const miners = Object.values(state.workers).filter((w) => {
        const z = state.positionByTag[w.wearable_id]?.zone_id ?? edgeZone[w.current_edge_id];
        return z === zoneId;
      });
      const teles = miners
        .map((w) => state.telemetryByTag[w.wearable_id])
        .filter((t): t is Telemetry => !!t);
      const gws = Object.values(state.gateways).filter((g) => g.zone_id === zoneId);
      const online = gws.filter((g) => g.status === "ONLINE").length;
      const alerts = Object.values(state.alerts).filter(
        (a) => a.location_zone_id === zoneId && a.status === "ACTIVE",
      ).length;
      return {
        zoneId,
        miners: miners.length,
        avgCh4: avg(teles.map((t) => t.ch4_lel)),
        avgO2: avg(teles.map((t) => t.o2_ambient)),
        avgHr: avg(teles.map((t) => t.hr)),
        avgSpo2: avg(teles.map((t) => t.spo2)),
        gwOnline: online,
        gwTotal: gws.length,
        alerts,
      };
    });
  }, [zones, state.workers, state.telemetryByTag, state.positionByTag, state.gateways, state.alerts, state.mine]);

  const alertRate = useMemo(() => {
    const active = Object.values(state.alerts).filter((a) => a.status === "ACTIVE").length;
    const windowAlerts = Object.values(state.alerts).filter(
      (a) => a.created_sim_ts >= simTimeS - rangeSeconds,
    ).length;
    return { active, windowAlerts };
  }, [state.alerts, simTimeS, rangeSeconds]);

  const gwRatio = useMemo(() => {
    const all = Object.values(state.gateways);
    const online = all.filter((g) => g.status === "ONLINE").length;
    return { online, total: all.length };
  }, [state.gateways]);

  const rangeLabel = RANGES.find((r) => r.seconds === rangeSeconds)?.label ?? "";

  return (
    <div className="page">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-wide text-slate-100">Trends</h2>
          <p className="text-sm text-slate-500">
            How mine conditions and miner health are changing over time
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">Window</span>
          <div className="flex gap-1 rounded-lg bg-panel2 p-1">
            {RANGES.map((r) => (
              <button
                key={r.seconds}
                type="button"
                onClick={() => setRangeSeconds(r.seconds)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  rangeSeconds === r.seconds
                    ? "bg-slate-600 text-slate-100"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Active alerts now"
          value={String(alertRate.active)}
          hint="Need attention"
          accent={alertRate.active > 0 ? "text-status-warning" : "text-status-normal"}
        />
        <Kpi
          label={`New alerts (${rangeLabel})`}
          value={String(alertRate.windowAlerts)}
          hint="Created in this window"
        />
        <Kpi
          label="Gateways online"
          value={`${gwRatio.online}/${gwRatio.total}`}
          hint="Radio coverage"
          accent={gwRatio.online < gwRatio.total ? "text-status-critical" : "text-status-normal"}
        />
        <Kpi
          label="Miners underground"
          value={String(Object.keys(state.workers).length)}
          hint="On the live roster"
        />
      </div>

      <section className="mb-6">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-300">
            Condition charts
          </h3>
          <p className="text-xs text-slate-500">
            Current value · min / avg / max over {rangeLabel}
          </p>
        </div>

        {mineSeries.points < 2 ? (
          <div className="rounded-lg border border-border bg-panel2 p-8 text-center">
            <p className="text-sm text-slate-300">Not enough history yet</p>
            <p className="mt-1 text-xs text-slate-500">
              Keep the simulation running — charts fill as telemetry arrives.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {CHARTS.map((c) => (
              <TrendChart
                key={c.key}
                title={c.title}
                subtitle={c.subtitle}
                unit={c.unit}
                color={c.color}
                values={mineSeries[c.key]}
                decimals={c.decimals}
                warn={c.warn?.(mineSeries[c.key][mineSeries[c.key].length - 1] ?? 0) ?? null}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-300">
          Right now by zone
        </h3>
        <p className="mb-3 text-xs text-slate-500">Live snapshot — not a trend, a current reading per corridor</p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-panel2 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Zone</th>
                <th className="px-3 py-2.5 font-semibold">Miners</th>
                <th className="px-3 py-2.5 font-semibold">CH₄ (LEL)</th>
                <th className="px-3 py-2.5 font-semibold">O₂ (%)</th>
                <th className="px-3 py-2.5 font-semibold">HR (bpm)</th>
                <th className="px-3 py-2.5 font-semibold">SpO₂ (%)</th>
                <th className="px-3 py-2.5 font-semibold">Gateways</th>
                <th className="px-3 py-2.5 font-semibold">Alerts</th>
              </tr>
            </thead>
            <tbody>
              {zoneSnapshots.map((z) => (
                <tr key={z.zoneId} className="border-t border-border/60 bg-panel hover:bg-panel2/80">
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-slate-100">{placeName(z.zoneId)}</div>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-base text-slate-200">{z.miners}</td>
                  <td className={`px-3 py-2.5 font-mono text-base ${(z.avgCh4 ?? 0) >= 10 ? "text-status-warning" : "text-slate-200"}`}>
                    {fmt(z.avgCh4, 2)}
                  </td>
                  <td className={`px-3 py-2.5 font-mono text-base ${(z.avgO2 ?? 21) < 19.5 ? "text-status-critical" : "text-slate-200"}`}>
                    {fmt(z.avgO2, 2)}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-base text-slate-200">{fmt(z.avgHr, 0)}</td>
                  <td className={`px-3 py-2.5 font-mono text-base ${(z.avgSpo2 ?? 100) < 94 ? "text-status-warning" : "text-slate-200"}`}>
                    {fmt(z.avgSpo2, 0)}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-base text-slate-200">
                    {z.gwOnline}/{z.gwTotal}
                  </td>
                  <td className={`px-3 py-2.5 font-mono text-base font-bold ${z.alerts > 0 ? "text-status-warning" : "text-slate-200"}`}>
                    {z.alerts}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function fmt(n: number | null, decimals: number) {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function buildMineSeries(
  historyByTag: Record<string, Telemetry[]>,
  simTimeS: number,
  rangeSeconds: number,
) {
  const buckets = 60;
  const start = simTimeS - rangeSeconds;
  const step = rangeSeconds / buckets;
  const ch4: number[] = [];
  const o2: number[] = [];
  const hr: number[] = [];
  const spo2: number[] = [];
  const battery: number[] = [];
  const minSpo2: number[] = [];
  let points = 0;

  for (let i = 0; i < buckets; i++) {
    const t0 = start + i * step;
    const t1 = t0 + step;
    const samples: Telemetry[] = [];
    for (const hist of Object.values(historyByTag)) {
      for (const t of hist) {
        if (t.ts >= t0 && t.ts < t1) samples.push(t);
      }
    }
    if (samples.length) {
      points++;
      ch4.push(avg(samples.map((s) => s.ch4_lel))!);
      o2.push(avg(samples.map((s) => s.o2_ambient))!);
      hr.push(avg(samples.map((s) => s.hr))!);
      spo2.push(avg(samples.map((s) => s.spo2))!);
      battery.push(avg(samples.map((s) => s.battery_pct))!);
      minSpo2.push(Math.min(...samples.map((s) => s.spo2)));
    }
  }

  return { ch4, o2, hr, spo2, battery, minSpo2, points };
}

function Kpi({
  label, value, hint, accent,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-panel2 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-0.5 font-mono text-3xl font-bold ${accent ?? "text-slate-100"}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-500">{hint}</div>
    </div>
  );
}

function TrendChart({
  title, subtitle, unit, color, values, decimals, warn,
}: {
  title: string;
  subtitle: string;
  unit: string;
  color: string;
  values: number[];
  decimals: number;
  warn: string | null;
}) {
  if (values.length < 2) {
    return (
      <div className="rounded-lg border border-border bg-panel2 p-5">
        <div className="text-sm font-semibold text-slate-200">{title}</div>
        <div className="mt-6 text-sm text-slate-600">Waiting for data…</div>
      </div>
    );
  }

  const latest = values[values.length - 1];
  const first = values[0];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const delta = latest - first;
  const deltaSign = delta > 0 ? "+" : "";

  const padL = 44;
  const padR = 12;
  const padT = 16;
  const padB = 28;
  const w = 520;
  const h = 220;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const yMin = min === max ? min - 1 : min;
  const yMax = min === max ? max + 1 : max;
  const yRange = yMax - yMin || 1;

  const pts = values.map((v, i) => {
    const x = padL + (i / (values.length - 1)) * plotW;
    const y = padT + plotH - ((v - yMin) / yRange) * plotH;
    return { x, y, v };
  });
  const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area =
    `${padL},${padT + plotH} ` +
    line +
    ` ${padL + plotW},${padT + plotH}`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const v = yMin + yRange * (1 - t);
    const y = padT + plotH * t;
    return { v, y };
  });

  return (
    <div className={`rounded-lg border bg-panel2 p-4 sm:p-5 ${warn ? "border-status-warning/50" : "border-border"}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-100">{title}</div>
          <div className="text-xs text-slate-500">{subtitle}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-3xl font-bold leading-none text-slate-50 sm:text-4xl">
            {latest.toFixed(decimals)}
            <span className="ml-1 text-sm font-semibold text-slate-500">{unit}</span>
          </div>
          <div className={`mt-1 font-mono text-xs ${delta >= 0 ? "text-slate-400" : "text-slate-400"}`}>
            {deltaSign}{delta.toFixed(decimals)} {unit} vs start of window
          </div>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <StatChip label="Min" value={`${min.toFixed(decimals)} ${unit}`} />
        <StatChip label="Avg" value={`${mean.toFixed(decimals)} ${unit}`} />
        <StatChip label="Max" value={`${max.toFixed(decimals)} ${unit}`} />
      </div>

      {warn && (
        <div className="mb-3 rounded bg-status-warning/15 px-3 py-1.5 text-xs font-medium text-status-warning">
          {warn}
        </div>
      )}

      <svg viewBox={`0 0 ${w} ${h}`} className="h-52 w-full sm:h-56" preserveAspectRatio="none">
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={padL} y1={t.y} x2={padL + plotW} y2={t.y}
              stroke="#232d38" strokeWidth={1}
            />
            <text x={padL - 6} y={t.y + 3} textAnchor="end" fill="#6b7683" fontSize={10} fontFamily="ui-monospace, monospace">
              {t.v.toFixed(decimals)}
            </text>
          </g>
        ))}
        <text x={padL} y={h - 8} fill="#6b7683" fontSize={10}>earlier</text>
        <text x={padL + plotW} y={h - 8} textAnchor="end" fill="#6b7683" fontSize={10}>now</text>
        <polygon points={area} fill={color} opacity={0.12} />
        <polyline points={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={4} fill={color} />
      </svg>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/60 bg-panel px-2.5 py-1.5">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-mono text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}
