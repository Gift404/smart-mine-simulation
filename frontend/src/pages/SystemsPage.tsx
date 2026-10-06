import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLive } from "../context/LiveDataContext";
import { api } from "../services/api";
import type { Gateway, MineSensor, SensorStatus, SensorType } from "../types";

type Tab = "overview" | "gateways" | "sensors";
type GwFilter = "ALL" | "OK" | "PROBLEM";
type SensorFilter = "ALL" | "OK" | "PROBLEM" | SensorType;

const ZONE_LABEL: Record<string, string> = {
  VERT_WEST: "West vertical",
  VERT_EAST: "East vertical",
  HORIZ_NORTH: "North drift",
  HORIZ_MID: "Mid drift",
  HORIZ_SOUTH: "South drift",
};

const TYPE_LABEL: Record<SensorType, string> = {
  CH4: "Methane monitor",
  O2: "Oxygen monitor",
  AIRFLOW: "Airflow sensor",
  TEMP: "Temperature sensor",
};

type Condition = "Good" | "Degraded" | "Offline" | "Fault" | "Backhaul down";

function zoneName(zoneId: string) {
  return ZONE_LABEL[zoneId] ?? zoneId.replace(/_/g, " ").toLowerCase();
}

function gatewayName(g: Gateway) {
  return `${zoneName(g.zone_id)} · ${g.gateway_id}`;
}

function sensorName(s: MineSensor) {
  const base = TYPE_LABEL[s.sensor_type] ?? s.sensor_type;
  const hub = s.linked_gateway_id ? ` near ${s.linked_gateway_id}` : "";
  return `${base} · ${zoneName(s.zone_id)}${hub}`;
}

function gatewayCondition(g: Gateway): Condition {
  if (g.status === "OFFLINE") return "Offline";
  if (g.backhaul_primary === "OFFLINE") return "Backhaul down";
  return "Good";
}

function sensorCondition(s: MineSensor): Condition {
  if (s.status === "FAULT") return "Fault";
  if (s.status === "OFFLINE") return "Offline";
  if (s.status === "DEGRADED" || s.battery_pct < 20 || s.maintenance_due_days <= 45) return "Degraded";
  return "Good";
}

const CONDITION_RANK: Record<Condition, number> = {
  Fault: 0,
  Offline: 1,
  "Backhaul down": 2,
  Degraded: 3,
  Good: 4,
};

const CONDITION_STYLE: Record<Condition, string> = {
  Good: "bg-status-normal/15 text-status-normal",
  Degraded: "bg-status-warning/15 text-status-warning",
  "Backhaul down": "bg-status-warning/15 text-status-warning",
  Offline: "bg-status-critical/15 text-status-critical",
  Fault: "bg-status-critical/15 text-status-critical",
};

export default function SystemsPage() {
  const { state } = useLive();
  const [tab, setTab] = useState<Tab>("overview");
  const [gwFilter, setGwFilter] = useState<GwFilter>("ALL");
  const [sensorFilter, setSensorFilter] = useState<SensorFilter>("ALL");
  const [busy, setBusy] = useState<string | null>(null);

  const gateways = useMemo(() => {
    let list = Object.values(state.gateways);
    list.sort((a, b) => {
      const ca = gatewayCondition(a);
      const cb = gatewayCondition(b);
      if (CONDITION_RANK[ca] !== CONDITION_RANK[cb]) return CONDITION_RANK[ca] - CONDITION_RANK[cb];
      return gatewayName(a).localeCompare(gatewayName(b)) || a.gateway_id.localeCompare(b.gateway_id);
    });
    if (gwFilter === "OK") list = list.filter((g) => gatewayCondition(g) === "Good");
    if (gwFilter === "PROBLEM") list = list.filter((g) => gatewayCondition(g) !== "Good");
    return list;
  }, [state.gateways, gwFilter]);

  const sensors = useMemo(() => {
    let list = Object.values(state.sensors);
    list.sort((a, b) => {
      const ca = sensorCondition(a);
      const cb = sensorCondition(b);
      if (CONDITION_RANK[ca] !== CONDITION_RANK[cb]) return CONDITION_RANK[ca] - CONDITION_RANK[cb];
      return sensorName(a).localeCompare(sensorName(b)) || a.sensor_id.localeCompare(b.sensor_id);
    });
    if (sensorFilter === "OK") list = list.filter((s) => sensorCondition(s) === "Good");
    else if (sensorFilter === "PROBLEM") list = list.filter((s) => sensorCondition(s) !== "Good");
    else if (sensorFilter !== "ALL") list = list.filter((s) => s.sensor_type === sensorFilter);
    return list;
  }, [state.sensors, sensorFilter]);

  const allGateways = Object.values(state.gateways);
  const allSensors = Object.values(state.sensors);
  const gwProblems = allGateways.filter((g) => gatewayCondition(g) !== "Good");
  const sensProblems = allSensors.filter((s) => sensorCondition(s) !== "Good");
  const gwOk = allGateways.filter((g) => gatewayCondition(g) === "Good");
  const sensOk = allSensors.filter((s) => sensorCondition(s) === "Good");

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-wide text-slate-100">Systems &amp; devices</h2>
          <p className="text-sm text-slate-500">
            Named mine infrastructure — see which units are healthy and which need work
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg bg-panel p-1">
          {([
            ["overview", "Overview"],
            ["gateways", "Gateways"],
            ["sensors", "Sensors"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold tracking-wide ${
                tab === id ? "bg-slate-600 text-slate-100" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Gateways OK" value={`${gwOk.length}/${allGateways.length}`} ok={gwProblems.length === 0} />
            <Kpi label="Gateways problem" value={String(gwProblems.length)} ok={gwProblems.length === 0} invert />
            <Kpi label="Sensors OK" value={`${sensOk.length}/${allSensors.length}`} ok={sensProblems.length === 0} />
            <Kpi label="Sensors problem" value={String(sensProblems.length)} ok={sensProblems.length === 0} invert />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <NamedGroup
              title="Needs attention"
              empty="All devices look healthy."
              tone="warn"
            >
              {[
                ...gwProblems
                  .sort((a, b) => CONDITION_RANK[gatewayCondition(a)] - CONDITION_RANK[gatewayCondition(b)])
                  .map((g) => ({
                    key: g.gateway_id,
                    name: gatewayName(g),
                    id: g.gateway_id,
                    condition: gatewayCondition(g),
                    detail: zoneName(g.zone_id),
                    href: `/?gateway=${g.gateway_id}`,
                  })),
                ...sensProblems
                  .sort((a, b) => CONDITION_RANK[sensorCondition(a)] - CONDITION_RANK[sensorCondition(b)])
                  .map((s) => ({
                    key: s.sensor_id,
                    name: sensorName(s),
                    id: s.sensor_id,
                    condition: sensorCondition(s),
                    detail: s.linked_gateway_id ? `via ${s.linked_gateway_id}` : zoneName(s.zone_id),
                  })),
              ].map((row) => (
                <DeviceRow key={row.key} {...row} />
              ))}
            </NamedGroup>

            <NamedGroup title="In good condition" empty="No healthy devices yet." tone="ok">
              {[
                ...gwOk
                  .sort((a, b) => gatewayName(a).localeCompare(gatewayName(b)))
                  .map((g) => ({
                    key: g.gateway_id,
                    name: gatewayName(g),
                    id: g.gateway_id,
                    condition: "Good" as Condition,
                    detail: zoneName(g.zone_id),
                    href: `/?gateway=${g.gateway_id}`,
                  })),
                ...sensOk
                  .sort((a, b) => sensorName(a).localeCompare(sensorName(b)))
                  .map((s) => ({
                    key: s.sensor_id,
                    name: sensorName(s),
                    id: s.sensor_id,
                    condition: "Good" as Condition,
                    detail: zoneName(s.zone_id),
                  })),
              ].map((row) => (
                <DeviceRow key={row.key} {...row} />
              ))}
            </NamedGroup>
          </div>
        </div>
      )}

      {tab === "gateways" && (
        <div>
          <FilterPills
            value={gwFilter}
            options={[
              ["ALL", "All"],
              ["PROBLEM", "Problems"],
              ["OK", "Good"],
            ]}
            onChange={setGwFilter}
          />
          <DeviceList>
            {gateways.map((g) => {
              const condition = gatewayCondition(g);
              const primaryDown = g.backhaul_primary === "OFFLINE";
              return (
                <li key={g.gateway_id} className="border-b border-border/50 last:border-0">
                  <div className="flex flex-wrap items-center gap-3 px-3 py-3 sm:px-4">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-slate-100">{gatewayName(g)}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                        <span className="font-mono">{g.gateway_id}</span>
                        <span>{zoneName(g.zone_id)}</span>
                        <span>
                          Primary{" "}
                          <span className={primaryDown ? "text-status-critical" : "text-status-normal"}>
                            {g.backhaul_primary}
                          </span>
                        </span>
                        <span>
                          Fallback{" "}
                          <span className={g.backhaul_fallback === "ONLINE" ? "text-status-normal" : "text-status-critical"}>
                            {g.backhaul_fallback}
                          </span>
                        </span>
                      </div>
                    </div>
                    <ConditionBadge condition={condition} />
                    <div className="flex flex-wrap gap-1.5">
                      <Link
                        to={`/?gateway=${g.gateway_id}`}
                        className="rounded bg-panel px-2 py-1 text-[10px] font-semibold text-sky-300 hover:text-sky-200"
                      >
                        Map
                      </Link>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          run(`bh-${g.gateway_id}`, () =>
                            api.setBackhaulFailure(g.gateway_id, g.backhaul_primary === "ONLINE"),
                          )
                        }
                        className="rounded bg-panel px-2 py-1 text-[10px] font-semibold text-slate-300 hover:text-white disabled:opacity-50"
                      >
                        {primaryDown ? "Restore primary" : "Fail primary"}
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          run(`gw-${g.gateway_id}`, () =>
                            api.setGatewayOffline(g.gateway_id, g.status === "ONLINE"),
                          )
                        }
                        className="rounded bg-panel px-2 py-1 text-[10px] font-semibold text-slate-300 hover:text-white disabled:opacity-50"
                      >
                        {g.status === "ONLINE" ? "Take offline" : "Bring online"}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </DeviceList>
          {gateways.length === 0 && <EmptyState text="No gateways match this filter." />}
        </div>
      )}

      {tab === "sensors" && (
        <div>
          <FilterPills
            value={sensorFilter}
            options={[
              ["ALL", "All"],
              ["PROBLEM", "Problems"],
              ["OK", "Good"],
              ["CH4", "CH4"],
              ["O2", "O2"],
              ["AIRFLOW", "Airflow"],
              ["TEMP", "Temp"],
            ]}
            onChange={setSensorFilter}
          />
          <DeviceList>
            {sensors.map((s) => {
              const condition = sensorCondition(s);
              return (
                <li key={s.sensor_id} className="border-b border-border/50 last:border-0">
                  <div className="flex flex-wrap items-center gap-3 px-3 py-3 sm:px-4">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-slate-100">{sensorName(s)}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                        <span className="font-mono">{s.sensor_id}</span>
                        <span>
                          {s.value == null ? "No reading" : `${s.value} ${s.unit}`}
                        </span>
                        <span>Battery {s.battery_pct.toFixed(0)}%</span>
                        <span className={s.maintenance_due_days <= 45 ? "text-status-warning" : undefined}>
                          Maint. {s.maintenance_due_days}d
                        </span>
                        {s.linked_gateway_id && (
                          <Link className="text-sky-300 hover:underline" to={`/?gateway=${s.linked_gateway_id}`}>
                            via {s.linked_gateway_id}
                          </Link>
                        )}
                      </div>
                    </div>
                    <ConditionBadge condition={condition} />
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          run(`so-${s.sensor_id}`, () =>
                            api.setSensorOffline(s.sensor_id, s.status !== "OFFLINE"),
                          )
                        }
                        className="rounded bg-panel px-2 py-1 text-[10px] font-semibold text-slate-300 hover:text-white disabled:opacity-50"
                      >
                        {s.status === "OFFLINE" ? "Bring online" : "Take offline"}
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          run(`sf-${s.sensor_id}`, () =>
                            api.setSensorFault(s.sensor_id, s.status !== "FAULT"),
                          )
                        }
                        className="rounded bg-panel px-2 py-1 text-[10px] font-semibold text-slate-300 hover:text-white disabled:opacity-50"
                      >
                        {s.status === "FAULT" ? "Clear fault" : "Mark fault"}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </DeviceList>
          {sensors.length === 0 && <EmptyState text="No sensors match this filter." />}
        </div>
      )}
    </div>
  );
}

function Kpi({
  label, value, ok, invert = false,
}: {
  label: string; value: string; ok: boolean; invert?: boolean;
}) {
  const warn = invert ? !ok : !ok;
  return (
    <div className="rounded-lg border border-border bg-panel2 px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${warn ? "text-status-warning" : "text-slate-100"}`}>
        {value}
      </div>
    </div>
  );
}

function NamedGroup({
  title, empty, tone, children,
}: {
  title: string;
  empty: string;
  tone: "ok" | "warn";
  children: React.ReactNode;
}) {
  const count = Array.isArray(children) ? children.length : children ? 1 : 0;
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-panel2">
      <div className={`border-b border-border/60 px-4 py-2.5 text-sm font-bold tracking-wide ${
        tone === "warn" ? "text-status-warning" : "text-status-normal"
      }`}>
        {title}
        <span className="ml-2 font-mono text-xs font-normal text-slate-500">({count})</span>
      </div>
      {count === 0 ? (
        <div className="px-4 py-6 text-sm text-slate-500">{empty}</div>
      ) : (
        <ul className="max-h-[28rem] divide-y divide-border/40 overflow-y-auto">{children}</ul>
      )}
    </section>
  );
}

function DeviceRow({
  name, id, condition, detail, href,
}: {
  name: string;
  id: string;
  condition: Condition;
  detail: string;
  href?: string;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-100">{name}</div>
        <div className="truncate text-xs text-slate-500">
          <span className="font-mono">{id}</span>
          <span className="mx-1.5 text-slate-600">·</span>
          {detail}
        </div>
      </div>
      <ConditionBadge condition={condition} />
      {href && (
        <Link to={href} className="shrink-0 text-[10px] font-semibold text-sky-300 hover:text-sky-200">
          Map
        </Link>
      )}
    </li>
  );
}

function ConditionBadge({ condition }: { condition: Condition }) {
  return (
    <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${CONDITION_STYLE[condition]}`}>
      {condition}
    </span>
  );
}

function FilterPills<T extends string>({
  value, options, onChange,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-1">
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`rounded px-2.5 py-1 text-xs font-semibold tracking-wide ${
            value === id ? "bg-slate-600 text-slate-100" : "bg-panel2 text-slate-400 hover:text-slate-200"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function DeviceList({ children }: { children: React.ReactNode }) {
  return (
    <ul className="overflow-hidden rounded-lg border border-border bg-panel2">
      {children}
    </ul>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-border bg-panel2 p-8 text-center text-slate-500">{text}</div>
  );
}
