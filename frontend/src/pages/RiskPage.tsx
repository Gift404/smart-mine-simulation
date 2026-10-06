import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLive } from "../context/LiveDataContext";
import {
  computeMineRisk,
  RISK_LEVEL_COLOR,
  type RiskLevel,
  type ZoneRisk,
} from "../services/riskEngine";

const LEVEL_GUIDE: { level: RiskLevel; meaning: string }[] = [
  { level: "LOW", meaning: "Safe to operate — keep monitoring" },
  { level: "MODERATE", meaning: "Watch closely — investigate soon" },
  { level: "HIGH", meaning: "Act now — restrict or reinforce the zone" },
  { level: "CRITICAL", meaning: "Emergency — evacuate / respond immediately" },
];

const ZONE_LABELS: Record<string, string> = {
  VERT_WEST: "West vertical",
  VERT_EAST: "East vertical",
  HORIZ_NORTH: "North horizontal",
  HORIZ_MID: "Mid horizontal",
  HORIZ_SOUTH: "South horizontal",
  MINE: "Whole mine",
};

function zoneName(id: string) {
  return ZONE_LABELS[id] ?? id.replace(/_/g, " ");
}

export default function RiskPage() {
  const { state, zones } = useLive();
  const [selectedZone, setSelectedZone] = useState<string | null>(null);

  const edgeZone = useMemo(() => {
    const m: Record<string, string> = {};
    for (const e of state.mine?.edges ?? []) m[e.id] = e.zone_id;
    return m;
  }, [state.mine]);

  const report = useMemo(
    () =>
      computeMineRisk({
        zones,
        workers: state.workers,
        telemetryByTag: state.telemetryByTag,
        telemetryHistoryByTag: state.telemetryHistoryByTag,
        positionByTag: state.positionByTag,
        alerts: state.alerts,
        gateways: state.gateways,
        edgeZone,
        simTimeS: state.status?.sim_time_s ?? 0,
      }),
    [zones, state, edgeZone],
  );

  const focus = selectedZone
    ? report.zones.find((z) => z.zoneId === selectedZone) ?? report.overall
    : report.overall;

  const hotZones = report.zones.filter((z) => z.level === "HIGH" || z.level === "CRITICAL");
  const verdict = verdictLine(report.overall, hotZones);

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-bold tracking-wide text-slate-100">Risk Engine</h2>
        <p className="text-sm text-slate-500">
          Live score of how dangerous the mine is right now — and what to do about it
        </p>
      </div>

      {/* Verdict banner */}
      <div
        className="mb-5 rounded-lg border p-4 sm:p-5"
        style={{
          borderColor: RISK_LEVEL_COLOR[report.overall.level] + "66",
          background: RISK_LEVEL_COLOR[report.overall.level] + "14",
        }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">Current verdict</div>
            <div className="mb-1 text-xl font-bold text-slate-100 sm:text-2xl">{verdict.title}</div>
            <p className="text-sm text-slate-300">{verdict.detail}</p>
          </div>
          <ScoreDial score={report.overall.score} level={report.overall.level} />
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-400">
          <span>
            <span className="font-mono text-slate-200">{report.overall.minerCount}</span> miners underground
          </span>
          <span>·</span>
          <span>
            <span className="font-mono text-slate-200">{report.overall.activeAlerts}</span> active alerts
          </span>
          <span>·</span>
          <span>
            <span className="font-mono text-slate-200">{hotZones.length}</span> hot zone
            {hotZones.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {/* How to read the score */}
      <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {LEVEL_GUIDE.map((g) => (
          <div
            key={g.level}
            className="rounded-lg border border-border bg-panel2 px-3 py-2"
            style={{
              outline:
                report.overall.level === g.level ? `1px solid ${RISK_LEVEL_COLOR[g.level]}` : undefined,
            }}
          >
            <div className="mb-0.5 flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: RISK_LEVEL_COLOR[g.level] }}
              />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: RISK_LEVEL_COLOR[g.level] }}>
                {g.level}
              </span>
              <span className="text-[10px] text-slate-600">
                {g.level === "LOW" ? "0–24" : g.level === "MODERATE" ? "25–49" : g.level === "HIGH" ? "50–74" : "75–100"}
              </span>
            </div>
            <p className="text-xs text-slate-400">{g.meaning}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* Zone comparison */}
        <section className="rounded-lg border border-border bg-panel2 p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-300">Zones at a glance</h3>
            <button
              type="button"
              onClick={() => setSelectedZone(null)}
              className={`text-[10px] uppercase tracking-wider ${
                selectedZone ? "text-sky-300 hover:text-sky-200" : "text-slate-600"
              }`}
            >
              Whole mine
            </button>
          </div>
          <p className="mb-3 text-xs text-slate-500">Tap a zone to see why it scored that way</p>
          <div className="space-y-2">
            {report.zones.map((z) => {
              const active = selectedZone === z.zoneId;
              return (
                <button
                  key={z.zoneId}
                  type="button"
                  onClick={() => setSelectedZone(active ? null : z.zoneId)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                    active
                      ? "border-slate-400 bg-panel"
                      : "border-border/70 bg-panel hover:border-slate-500"
                  }`}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-100">{zoneName(z.zoneId)}</div>
                      <div className="text-[10px] text-slate-500">
                        {z.minerCount} miner{z.minerCount === 1 ? "" : "s"}
                        {" · "}
                        {z.activeAlerts} alert{z.activeAlerts === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-lg font-bold" style={{ color: RISK_LEVEL_COLOR[z.level] }}>
                        {z.score.toFixed(0)}
                      </span>
                      <LevelPill level={z.level} />
                    </div>
                  </div>
                  <RiskBar score={z.score} level={z.level} />
                </button>
              );
            })}
            {report.zones.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">Waiting for mine zones…</p>
            )}
          </div>
        </section>

        {/* Detail panel */}
        <section className="rounded-lg border border-border bg-panel2 p-4">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">
            {selectedZone ? "Selected zone" : "Mine-wide detail"}
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-slate-100">{zoneName(focus.zoneId)}</h3>
            <LevelPill level={focus.level} />
            <span className="font-mono text-slate-400">{focus.score.toFixed(0)} / 100</span>
          </div>

          <RiskBar score={focus.score} level={focus.level} />

          <div className="mt-4 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Why this score
          </div>
          {focus.factors.length === 0 ? (
            <p className="rounded border border-border/50 bg-panel px-3 py-3 text-sm text-slate-400">
              Nothing unusual detected here. Conditions look stable.
            </p>
          ) : (
            <ul className="space-y-2">
              {focus.factors.slice(0, 6).map((f, i) => (
                <li key={f.id + i} className="rounded border border-border/50 bg-panel px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-100">{f.label}</div>
                      <div className="text-xs text-slate-400">{plainFactor(f.detail)}</div>
                    </div>
                    <span className="shrink-0 rounded bg-status-warning/15 px-1.5 py-0.5 font-mono text-[10px] text-status-warning">
                      +{f.weight.toFixed(0)} pts
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            What to do next
          </div>
          <ol className="mb-4 list-decimal space-y-1.5 pl-4 text-sm text-slate-200">
            {focus.actions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ol>

          <div className="flex flex-wrap gap-2">
            <Link
              to="/alerts"
              className="rounded bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-600"
            >
              Open alerts
            </Link>
            <Link
              to="/miners"
              className="rounded bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/30"
            >
              Open miners
            </Link>
            <Link
              to="/"
              className="rounded bg-panel px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-slate-100"
            >
              Live map
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function verdictLine(overall: ZoneRisk, hotZones: ZoneRisk[]) {
  if (overall.level === "LOW") {
    return {
      title: "Mine looks safe",
      detail: "No major gas, vital, or coverage problems right now. Keep the usual watch.",
    };
  }
  if (overall.level === "MODERATE") {
    return {
      title: "Elevated risk — stay alert",
      detail:
        hotZones.length > 0
          ? `Watch ${zoneName(hotZones[0].zoneId)} first. Check the drivers on the right.`
          : "Something is off. Review the drivers below before they escalate.",
    };
  }
  if (overall.level === "HIGH") {
    return {
      title: "High risk — take action",
      detail:
        hotZones.length > 0
          ? `${zoneName(hotZones[0].zoneId)} is the priority. Follow the steps under “What to do next”.`
          : "Conditions are serious. Follow the recommended actions now.",
    };
  }
  return {
    title: "Critical risk — emergency response",
    detail:
      hotZones.length > 0
        ? `${hotZones.map((z) => zoneName(z.zoneId)).join(", ")} need immediate attention.`
        : "Treat this as an emergency until alerts and gases are under control.",
  };
}

function plainFactor(detail: string) {
  // Strip redundant zone prefixes like "VERT_EAST: ..." when already in zone context
  return detail.replace(/^[A-Z_]+:\s*/, "");
}

function ScoreDial({ score, level }: { score: number; level: RiskLevel }) {
  const color = RISK_LEVEL_COLOR[level];
  return (
    <div className="flex shrink-0 flex-col items-center justify-center rounded-lg border border-border/60 bg-panel px-6 py-3">
      <div className="font-mono text-4xl font-bold leading-none" style={{ color }}>
        {score.toFixed(0)}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">risk / 100</div>
      <LevelPill level={level} />
    </div>
  );
}

function LevelPill({ level }: { level: RiskLevel }) {
  return (
    <span
      className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
      style={{
        background: RISK_LEVEL_COLOR[level] + "33",
        color: RISK_LEVEL_COLOR[level],
      }}
    >
      {level}
    </span>
  );
}

function RiskBar({ score, level }: { score: number; level: RiskLevel }) {
  const pct = Math.min(100, Math.max(0, score));
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-panel">
      {/* tick marks for level bands */}
      <div className="pointer-events-none absolute inset-0 flex">
        <div className="w-[25%] border-r border-border/40" />
        <div className="w-[25%] border-r border-border/40" />
        <div className="w-[25%] border-r border-border/40" />
        <div className="w-[25%]" />
      </div>
      <div
        className="relative h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: RISK_LEVEL_COLOR[level] }}
      />
    </div>
  );
}
