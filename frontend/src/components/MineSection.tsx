/**
 * Long-section view: levels stacked top-to-bottom by depth, each band holding a flattened
 * plan of that level (east → right, north → up), with shafts and raises as vertical links.
 * Levels are evenly spaced so shallow and deep levels get the same room; the gutter shows true depths.
 */
import {
  useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode,
} from "react";
import type {
  Alert, Gateway, Geofence, MineGraph, MineLevel, MineNode, PositionEstimate, Telemetry, Vehicle, Worker,
} from "../types";
import { STATUS_COLOR, workerDisplayStatus } from "../services/status";
import {
  NODE_STYLE, SHAFT_COLORS, declutter, edgeColor, isVerticalEdge, levelColor, mineLegend, textWidth,
  type LabelBox,
} from "./mineStyle";
import WorkerStatusCard from "./WorkerStatusCard";
import VehicleStatusCard from "./VehicleStatusCard";

interface Props {
  mine: MineGraph | null;
  workers: Record<string, Worker>;
  vehicles: Record<string, Vehicle>;
  gateways: Record<string, Gateway>;
  alerts: Record<string, Alert>;
  geofences?: Geofence[];
  telemetryByTag: Record<string, Telemetry>;
  positionByTag: Record<string, PositionEstimate>;
  selectedWorkerId: string | null;
  trackingId: string | null;
  focusGatewayId?: string | null;
  onSelectWorker: (id: string | null) => void;
  onStartTracking: (id: string) => void;
  onStopTracking: () => void;
  selectedVehicleId?: string | null;
  trackedVehicleId?: string | null;
  onSelectVehicle?: (id: string | null) => void;
  onStartTrackingVehicle?: (id: string) => void;
}

/** Bounds on the vertical squash applied to northings inside a level band */
const SQUASH_MIN = 0.14;
const SQUASH_MAX = 0.6;
const BAND_PAD = 18;
const BAND_GAP = 40;
const MARGIN_X = 40;
/** Screen px reserved on the left for the sticky level labels */
const GUTTER_PX = 150;
/** Screen px reserved on the right for the docked legend (wide panels only) */
const LEGEND_PX = 200;
const ZOOM_STEP = 1.25;
const MOTION = "transform 0.8s linear";

interface Layout {
  levels: MineLevel[];
  bands: { level: MineLevel; cy: number; top: number; bottom: number }[];
  bandH: number;
  squash: number;
  zMid: number;
  xMin: number;
  xMax: number;
  project: (x: number, y: number, z: number) => [number, number];
  bounds: { x0: number; y0: number; x1: number; y1: number };
}

/** Pick the squash that makes the stacked drawing match the drawable area's shape. */
function squashFor(mine: MineGraph, drawW: number, drawH: number): number {
  const n = Math.max(1, mine.levels?.length ?? 1);
  const xs = mine.nodes.map((nd) => nd.x);
  const zs = mine.nodes.map((nd) => nd.z ?? 0);
  const width = Math.max(...xs) - Math.min(...xs) + MARGIN_X * 2;
  const zRange = Math.max(1, Math.max(...zs) - Math.min(...zs));
  const targetH = (drawH / Math.max(1, drawW)) * width;
  const s = (targetH - (n - 1) * BAND_GAP - n * BAND_PAD * 2) / (n * zRange);
  return Math.min(SQUASH_MAX, Math.max(SQUASH_MIN, s));
}

function buildLayout(mine: MineGraph, squash: number): Layout {
  const SQUASH = squash;
  const levels = [...(mine.levels ?? [])].sort((a, b) => b.depth_m - a.depth_m);
  const xs = mine.nodes.map((n) => n.x);
  const zs = mine.nodes.map((n) => n.z ?? 0);
  const zMin = Math.min(...zs);
  const zMax = Math.max(...zs);
  const zMid = (zMin + zMax) / 2;
  const bandH = Math.max(50, (zMax - zMin) * SQUASH + BAND_PAD * 2);
  const bands = levels.map((level, i) => {
    const cy = i * (bandH + BAND_GAP) + bandH / 2;
    return { level, cy, top: cy - bandH / 2, bottom: cy + bandH / 2 };
  });

  // Piecewise-linear depth → band centre, so shaft travel moves smoothly between bands
  const depthToY = (y: number): number => {
    if (!bands.length) return -y;
    const first = bands[0];
    const last = bands[bands.length - 1];
    if (y >= first.level.depth_m) return first.cy - (y - first.level.depth_m) * 0.3;
    if (y <= last.level.depth_m) return last.cy + (last.level.depth_m - y) * 0.3;
    for (let i = 0; i < bands.length - 1; i++) {
      const a = bands[i];
      const b = bands[i + 1];
      if (y <= a.level.depth_m && y >= b.level.depth_m) {
        const t = (a.level.depth_m - y) / (a.level.depth_m - b.level.depth_m || 1);
        return a.cy + t * (b.cy - a.cy);
      }
    }
    return -y;
  };

  const xMin = Math.min(...xs) - MARGIN_X;
  const xMax = Math.max(...xs) + MARGIN_X;
  return {
    levels,
    bands,
    bandH,
    squash,
    zMid,
    xMin,
    xMax,
    project: (x, y, z) => [x, depthToY(y) - (z - zMid) * SQUASH],
    bounds: {
      x0: xMin,
      x1: xMax,
      y0: bands.length ? bands[0].top : 0,
      y1: bands.length ? bands[bands.length - 1].bottom : 0,
    },
  };
}

type ViewBox = { x: number; y: number; w: number };

function fitView(b: Layout["bounds"], size: { w: number; h: number }, rightPx: number): ViewBox {
  const availW = Math.max(80, size.w - GUTTER_PX - rightPx - 16);
  const availH = Math.max(80, size.h - 16);
  const bw = b.x1 - b.x0;
  const bh = b.y1 - b.y0;
  const k = Math.max(bw / availW, bh / availH);
  return {
    x: b.x0 - (GUTTER_PX + 8) * k - (availW * k - bw) / 2,
    y: b.y0 - 8 * k - (availH * k - bh) / 2,
    w: size.w * k,
  };
}

export default function MineSection({
  mine, workers, vehicles, gateways, alerts, geofences = [], telemetryByTag, positionByTag,
  selectedWorkerId, trackingId, focusGatewayId = null,
  onSelectWorker, onStartTracking, onStopTracking,
  selectedVehicleId = null, trackedVehicleId = null, onSelectVehicle, onStartTrackingVehicle,
}: Props) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 900, h: 420 });
  const [vb, setVb] = useState<ViewBox | null>(null);
  const [levelFocus, setLevelFocus] = useState<string>("ALL");
  const [showLegend, setShowLegend] = useState(true);
  const vbRef = useRef<ViewBox | null>(null);
  const goalRef = useRef<ViewBox | null>(null);
  const dragRef = useRef<{ ox: number; oy: number; vb: ViewBox } | null>(null);
  const trackingRef = useRef<string | null>(null);
  trackingRef.current = trackingId ?? trackedVehicleId;
  const anyTracking = !!(trackingId || trackedVehicleId);

  const legendDocked = showLegend && size.w >= 720;
  const rightPx = legendDocked ? LEGEND_PX : 0;
  const squash = mine
    ? Math.round(squashFor(mine, size.w - GUTTER_PX - rightPx - 16, size.h - 16) * 50) / 50
    : SQUASH_MIN;
  const layout = useMemo(() => (mine ? buildLayout(mine, squash) : null), [mine, squash]);
  const nodeById = useMemo(
    () => Object.fromEntries((mine?.nodes ?? []).map((n) => [n.id, n])) as Record<string, MineNode>,
    [mine],
  );

  useLayoutEffect(() => {
    if (!container) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [container]);

  const commitVb = (next: ViewBox) => {
    vbRef.current = next;
    setVb(next);
  };

  const boundsForLevel = (levelId: string): Layout["bounds"] | null => {
    if (!layout || !mine) return null;
    if (levelId === "ALL") return layout.bounds;
    const band = layout.bands.find((b) => b.level.id === levelId);
    if (!band) return layout.bounds;
    const xs = mine.nodes.filter((n) => n.level_id === levelId).map((n) => n.x);
    const x0 = xs.length ? Math.min(...xs) - MARGIN_X * 2 : layout.xMin;
    const x1 = xs.length ? Math.max(...xs) + MARGIN_X * 2 : layout.xMax;
    return { x0, x1, y0: band.top - BAND_GAP * 0.4, y1: band.bottom + BAND_GAP * 0.4 };
  };

  // Fit the whole mine on first layout and whenever the panel is resized
  useEffect(() => {
    const b = boundsForLevel(levelFocus);
    if (!b) return;
    goalRef.current = null;
    commitVb(fitView(b, size, rightPx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, size.w, size.h, rightPx]);

  const focusLevel = (levelId: string) => {
    setLevelFocus(levelId);
    const b = boundsForLevel(levelId);
    if (b) goalRef.current = fitView(b, size, rightPx);
    if (anyTracking) onStopTracking();
  };

  // Ease the view toward the goal (level focus or tracked miner)
  useEffect(() => {
    let raf = 0;
    const step = () => {
      const goal = goalRef.current;
      const cur = vbRef.current;
      if (goal && cur && !dragRef.current) {
        const t = 0.14;
        const next = { x: cur.x + (goal.x - cur.x) * t, y: cur.y + (goal.y - cur.y) * t, w: cur.w + (goal.w - cur.w) * t };
        const done = Math.abs(goal.x - next.x) + Math.abs(goal.y - next.y) + Math.abs(goal.w - next.w) < next.w * 0.0015;
        commitVb(done ? goal : next);
        if (done && !trackingRef.current) goalRef.current = null;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!layout || !vbRef.current) return;
    const target = trackingId ? workers[trackingId] : trackedVehicleId ? vehicles[trackedVehicleId] : null;
    if (!target) return;
    const [px, py] = layout.project(target.x, target.y, target.z ?? 0);
    const cur = vbRef.current;
    const k = cur.w / size.w;
    const visW = cur.w - GUTTER_PX * k;
    const h = size.h * k;
    goalRef.current = { x: px - GUTTER_PX * k - visW / 2, y: py - h / 2, w: cur.w };
  }, [trackingId, trackedVehicleId, workers, vehicles, layout, size.w, size.h]);

  useEffect(() => {
    if (!focusGatewayId || !layout || !vbRef.current) return;
    const g = gateways[focusGatewayId];
    if (!g) return;
    const [px, py] = layout.project(g.x, g.y, g.z ?? 0);
    const cur = vbRef.current;
    const k = cur.w / size.w;
    goalRef.current = { x: px - (cur.w + GUTTER_PX * k) / 2, y: py - (size.h * k) / 2, w: cur.w };
  }, [focusGatewayId, gateways, layout, size.w, size.h]);

  useEffect(() => {
    if (trackingId && !workers[trackingId]) onStopTracking();
    if (trackedVehicleId && !vehicles[trackedVehicleId]) onStopTracking();
  }, [trackingId, trackedVehicleId, workers, vehicles, onStopTracking]);

  if (!mine || !layout || !vb) {
    return (
      <div ref={setContainer} className="flex h-full items-center justify-center text-slate-500">
        Loading mine section…
      </div>
    );
  }

  const k = vb.w / size.w;
  const vbH = size.h * k;
  const toPx = (x: number, y: number): [number, number] => [(x - vb.x) / k, (y - vb.y) / k];

  const zoomAt = (factor: number, cx = size.w / 2, cy = size.h / 2) => {
    const cur = vbRef.current;
    if (!cur) return;
    const ck = cur.w / size.w;
    const wx = cur.x + cx * ck;
    const wy = cur.y + cy * ck;
    const fit = fitView(layout.bounds, size, rightPx);
    const w = Math.min(fit.w * 1.6, Math.max(fit.w / 14, cur.w * factor));
    const nk = w / size.w;
    goalRef.current = null;
    if (anyTracking) onStopTracking();
    commitVb({ x: wx - cx * nk, y: wy - cy * nk, w });
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as Element).closest?.("[data-pick]")) return;
    if (anyTracking) onStopTracking();
    goalRef.current = null;
    dragRef.current = { ox: e.clientX, oy: e.clientY, vb: vbRef.current ?? vb };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dk = d.vb.w / size.w;
    commitVb({ x: d.vb.x - (e.clientX - d.ox) * dk, y: d.vb.y - (e.clientY - d.oy) * dk, w: d.vb.w });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const statusOf = (w: Worker) => workerDisplayStatus(w, alerts);
  const onFoot = Object.values(workers).filter((w) => !w.assigned_vehicle_id);
  const fleet = Object.values(vehicles);

  // Labels: miners and vehicles always win, then facilities by importance
  const labelBoxes: LabelBox[] = [];
  const facilityNodes = mine.nodes.filter((n) => NODE_STYLE[n.type]);
  for (const n of facilityNodes) {
    const [sx, sy] = layout.project(n.x, n.y, n.z ?? 0);
    const [px, py] = toPx(sx, sy);
    const text = NODE_STYLE[n.type].label;
    labelBoxes.push({ id: `n:${n.id}`, x: px + 7, y: py - 7, w: textWidth(text, 10), h: 13, priority: NODE_STYLE[n.type].priority });
  }
  for (const v of fleet) {
    const [sx, sy] = layout.project(v.x, v.y, v.z ?? 0);
    const [px, py] = toPx(sx, sy);
    const picked = v.vehicle_id === trackedVehicleId || v.vehicle_id === selectedVehicleId;
    labelBoxes.push({ id: `v:${v.vehicle_id}`, x: px + 11, y: py - 8, w: textWidth(vehicleLabel(v), 10), h: 14, priority: picked ? 320 : 150 });
  }
  for (const w of onFoot) {
    const [sx, sy] = layout.project(w.x, w.y, w.z ?? 0);
    const [px, py] = toPx(sx, sy);
    const urgent = statusOf(w) !== "NORMAL" || w.worker_id === trackingId || w.worker_id === selectedWorkerId;
    labelBoxes.push({ id: `w:${w.worker_id}`, x: px + 8, y: py - 7, w: textWidth(w.worker_id, 11), h: 14, priority: urgent ? 300 : 200 });
  }
  const shown = declutter(labelBoxes);

  const focusWorker = selectedWorkerId ? workers[selectedWorkerId] : trackingId ? workers[trackingId] : null;
  const trackedWorker = trackingId ? workers[trackingId] : null;
  const trackedVehicle = trackedVehicleId ? vehicles[trackedVehicleId] : null;
  const vehicleFocusId = selectedVehicleId ?? trackedVehicleId;
  const focusVehicle = !focusWorker && vehicleFocusId ? vehicles[vehicleFocusId] ?? null : null;
  const driverVehicleId = trackedWorker?.assigned_vehicle_id ?? null;
  const legend = mineLegend(mine);

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-1">
        <span className="mr-1 text-[10px] uppercase tracking-wider text-slate-500">Level</span>
        <LevelButton active={levelFocus === "ALL"} onClick={() => focusLevel("ALL")} label="All levels" />
        {layout.levels.map((lv) => (
          <LevelButton
            key={lv.id}
            active={levelFocus === lv.id}
            onClick={() => focusLevel(lv.id)}
            label={lv.label}
            color={levelColor(lv.id)}
          />
        ))}
        <div className="ml-auto flex items-center gap-1">
          {trackedWorker && (
            <button
              type="button"
              onClick={onStopTracking}
              className="rounded bg-sky-500/20 px-2 py-1 text-[10px] font-semibold text-sky-300"
            >
              Tracking {trackedWorker.worker_id} · stop
            </button>
          )}
          {trackedVehicle && (
            <button
              type="button"
              onClick={onStopTracking}
              className="rounded bg-sky-500/20 px-2 py-1 text-[10px] font-semibold text-sky-300"
            >
              Tracking {trackedVehicle.vehicle_id} · stop
            </button>
          )}
          <ToolButton onClick={() => zoomAt(1 / ZOOM_STEP)} title="Zoom in">+</ToolButton>
          <ToolButton onClick={() => zoomAt(ZOOM_STEP)} title="Zoom out">−</ToolButton>
          <ToolButton onClick={() => focusLevel(levelFocus)} title="Fit the selected level(s) to the panel">Fit</ToolButton>
          <ToolButton onClick={() => setShowLegend((s) => !s)} title="Show or hide the legend">
            {showLegend ? "Hide legend" : "Legend"}
          </ToolButton>
        </div>
      </div>

      <div
        ref={setContainer}
        className="relative min-h-0 flex-1 overflow-hidden rounded border border-border/60 bg-[#0a0e13]"
      >
        <svg
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vbH}`}
          className="absolute inset-0 h-full w-full cursor-grab select-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={(e) => {
            const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            zoomAt(e.deltaY < 0 ? 1 / 1.15 : 1.15, e.clientX - rect.left, e.clientY - rect.top);
          }}
        >
          {/* Level bands */}
          {layout.bands.map((b) => {
            const color = levelColor(b.level.id);
            const focused = levelFocus === b.level.id;
            return (
              <g key={b.level.id}>
                <rect
                  x={layout.xMin}
                  y={b.top}
                  width={layout.xMax - layout.xMin}
                  height={b.bottom - b.top}
                  rx={10 * k}
                  fill={color}
                  fillOpacity={focused ? 0.1 : 0.045}
                  stroke={color}
                  strokeOpacity={focused ? 0.6 : 0.22}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}

          {/* Active stopes, faint, so production areas read without hiding the drives */}
          {(mine.stopes ?? []).filter((s) => s.state === "active").map((s) => {
            const [sx, sy] = layout.project(s.x, s.y, s.z);
            const [sw, , sd] = mine.stope_size_m ?? [80, 24, 55];
            return (
              <rect
                key={s.id}
                x={sx - sw / 2}
                y={sy - (sd * layout.squash) / 2}
                width={sw}
                height={sd * layout.squash}
                fill="#f97316"
                fillOpacity={0.1}
                stroke="#f97316"
                strokeOpacity={0.35}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          {/* Geofenced danger zones */}
          {geofences.flatMap((f) =>
            f.nodes.map((n) => {
              const [sx, sy] = layout.project(n.x, n.y, n.z ?? 0);
              const color = f.severity === "CRITICAL" ? "#fb7185" : "#fbbf24";
              const r = Math.max(f.radius_m, 10 * k);
              return (
                <ellipse
                  key={`${f.fence_id}-${n.id}`}
                  cx={sx}
                  cy={sy}
                  rx={r}
                  ry={Math.max(r * layout.squash, 8 * k)}
                  fill={color}
                  fillOpacity={0.13}
                  stroke={color}
                  strokeOpacity={0.75}
                  strokeWidth={1.2}
                  strokeDasharray="4 3"
                  vectorEffect="non-scaling-stroke"
                >
                  <title>{`${f.name} — ${f.message}`}</title>
                </ellipse>
              );
            }),
          )}

          {/* Shafts, raises and ore passes behind the level drives */}
          {mine.edges.filter(isVerticalEdge).map((e) => {
            const a = nodeById[e.start];
            const b = nodeById[e.end];
            if (!a || !b) return null;
            const [x1, y1] = layout.project(a.x, a.y, a.z ?? 0);
            const [x2, y2] = layout.project(b.x, b.y, b.z ?? 0);
            const dash = e.kind === "vent_shaft" ? "7 5" : e.kind === "ore_pass" ? "3 3" : undefined;
            return (
              <line
                key={e.id}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={SHAFT_COLORS[e.zone_id] ?? (e.kind === "ore_pass" ? "#b45309" : "#6b9e7a")}
                strokeWidth={e.kind === "shaft" ? 3.5 : 2.2}
                strokeDasharray={dash}
                strokeLinecap="round"
                opacity={0.85}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          {/* Level drives and ramps: dark casing first so crossings stay legible */}
          {mine.edges.filter((e) => !isVerticalEdge(e)).map((e) => {
            const a = nodeById[e.start];
            const b = nodeById[e.end];
            if (!a || !b) return null;
            const [x1, y1] = layout.project(a.x, a.y, a.z ?? 0);
            const [x2, y2] = layout.project(b.x, b.y, b.z ?? 0);
            return (
              <line key={`case-${e.id}`} x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="#0a0e13" strokeWidth={7.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            );
          })}
          {mine.edges.filter((e) => !isVerticalEdge(e)).map((e) => {
            const a = nodeById[e.start];
            const b = nodeById[e.end];
            if (!a || !b) return null;
            const [x1, y1] = layout.project(a.x, a.y, a.z ?? 0);
            const [x2, y2] = layout.project(b.x, b.y, b.z ?? 0);
            const ramp = e.kind === "ramp";
            return (
              <line
                key={e.id}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={edgeColor(e, nodeById)}
                strokeWidth={ramp ? 3 : 4}
                strokeDasharray={ramp ? "10 4" : undefined}
                strokeLinecap="round"
                opacity={0.9}
                vectorEffect="non-scaling-stroke"
              >
                <title>{`${e.id} · ${e.zone_id}`}</title>
              </line>
            );
          })}

          {/* Facilities */}
          {facilityNodes.map((n) => {
            const [sx, sy] = layout.project(n.x, n.y, n.z ?? 0);
            const style = NODE_STYLE[n.type];
            const station = n.type === "lift_station" || n.type === "surface";
            const s = 4.5 * k;
            return (
              <g key={n.id}>
                {station ? (
                  <rect x={sx - s} y={sy - s} width={s * 2} height={s * 2} rx={1.5 * k}
                        fill={style.color} stroke="#0a0e13" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                ) : (
                  <circle cx={sx} cy={sy} r={s} fill={style.color}
                          stroke="#0a0e13" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                )}
                <title>{`${style.label} · ${n.id}`}</title>
                {shown.has(`n:${n.id}`) && (
                  <text x={sx + 7 * k} y={sy + 3.5 * k} fontSize={10 * k} fill={style.color} fillOpacity={0.9}
                        style={{ paintOrder: "stroke" }} stroke="#0a0e13" strokeWidth={3 * k}>
                    {style.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Gateways: small and quiet unless offline or searched */}
          {Object.values(gateways).map((g) => {
            const [sx, sy] = layout.project(g.x, g.y, g.z ?? 0);
            const online = g.status === "ONLINE";
            const focused = g.gateway_id === focusGatewayId;
            const s = (focused ? 4 : 2.6) * k;
            return (
              <g key={g.gateway_id}>
                {focused && (
                  <circle cx={sx} cy={sy} r={11 * k} fill="none" stroke="#38bdf8" strokeWidth={1.5}
                          strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
                )}
                <rect x={sx - s} y={sy - s} width={s * 2} height={s * 2}
                      fill={online ? "#3b82f6" : "#f13c3c"} opacity={online && !focused ? 0.55 : 1}>
                  <title>{`${g.gateway_id} · ${g.status}`}</title>
                </rect>
              </g>
            );
          })}

          {/* Haulage fleet */}
          {fleet.map((v) => {
            const [sx, sy] = layout.project(v.x, v.y, v.z ?? 0);
            const fill = Math.max(0, Math.min(1, v.cargo_fill ?? 0));
            const w = 16 * k;
            const h = 9 * k;
            const tracking = v.vehicle_id === trackedVehicleId || v.vehicle_id === driverVehicleId;
            const selected = v.vehicle_id === selectedVehicleId;
            return (
              <g
                key={v.vehicle_id}
                data-pick
                className="cursor-pointer"
                style={{ transform: `translate(${sx}px, ${sy}px)`, transition: MOTION }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  onSelectVehicle?.(v.vehicle_id);
                }}
              >
                <rect x={-w} y={-w} width={w * 2} height={w * 2} fill="transparent" />
                {(tracking || selected) && (
                  <circle r={w * 0.95} fill="none" stroke={tracking ? "#38bdf8" : "#ffffff"} strokeWidth={1.6}
                          strokeDasharray={tracking ? "3 2" : undefined} vectorEffect="non-scaling-stroke" />
                )}
                <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={2 * k}
                      fill={v.kind === "lhd" ? "#ca8a04" : "#a16207"} stroke="#fde68a" strokeWidth={1.2}
                      vectorEffect="non-scaling-stroke" />
                <rect x={-w / 2 + 2 * k} y={-h / 2 + 2 * k} width={(w - 4 * k) * fill} height={h - 4 * k}
                      fill="#451a03" opacity={0.8} />
                <title>{`${v.vehicle_id} · ${v.driver_name ?? "no driver"} · ${v.activity ?? v.phase}`}</title>
                {shown.has(`v:${v.vehicle_id}`) && (
                  <text x={11 * k} y={4 * k} fontSize={10 * k} fontWeight={700} fill={tracking ? "#7dd3fc" : "#fde68a"}
                        style={{ paintOrder: "stroke" }} stroke="#0a0e13" strokeWidth={3 * k}>
                    {tracking ? `▶ ${vehicleLabel(v)}` : vehicleLabel(v)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Miners on foot */}
          {onFoot.map((w) => {
            const [sx, sy] = layout.project(w.x, w.y, w.z ?? 0);
            const status = statusOf(w);
            const tracking = w.worker_id === trackingId;
            const selected = w.worker_id === selectedWorkerId;
            const vibrating = !!w.watch_vibrating;
            const color = vibrating ? "#fb7185" : STATUS_COLOR[status];
            const r = 6 * k;
            return (
              <g
                key={w.worker_id}
                data-pick
                className="cursor-pointer"
                style={{ transform: `translate(${sx}px, ${sy}px)`, transition: MOTION }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  onSelectWorker(w.worker_id);
                }}
              >
                {(status === "CRITICAL" || vibrating) && (
                  <circle r={r * 2} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke">
                    <animate attributeName="r" values={`${r * 1.4};${r * 2.4};${r * 1.4}`} dur="0.9s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.9;0.15;0.9" dur="0.9s" repeatCount="indefinite" />
                  </circle>
                )}
                {(tracking || selected) && (
                  <circle r={r * 1.7} fill="none" stroke={tracking ? "#38bdf8" : "#ffffff"} strokeWidth={1.6}
                          strokeDasharray={tracking ? "3 2" : undefined} vectorEffect="non-scaling-stroke" />
                )}
                <circle r={r} fill={color} stroke="#0a0e13" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
                <circle r={r * 2} fill="transparent" />
                <title>{`${w.worker_id} · ${w.name} · ${w.role}${w.activity ? ` · ${w.activity}` : ""}`}</title>
                {shown.has(`w:${w.worker_id}`) && (
                  <text x={8.5 * k} y={4 * k} fontSize={11 * k} fontWeight={700}
                        fill={status === "NORMAL" ? "#e2e8f0" : color}
                        style={{ paintOrder: "stroke" }} stroke="#0a0e13" strokeWidth={3 * k}>
                    {w.worker_id}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Sticky level labels with true depth and live head-count */}
        <div className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-[#0a0e13] via-[#0a0e13]/90 to-transparent"
             style={{ width: GUTTER_PX }} />
        {layout.bands.map((b, i) => {
          const [, py] = toPx(0, b.cy);
          if (py < -40 || py > size.h + 40) return null;
          const color = levelColor(b.level.id);
          const miners = Object.values(workers).filter((w) => w.level === b.level.id);
          const trucks = fleet.filter((v) => v.level === b.level.id).length;
          const alarm = miners.some((w) => statusOf(w) === "CRITICAL" || w.watch_vibrating);
          const next = layout.bands[i + 1];
          const gapPx = next ? toPx(0, (b.bottom + next.top) / 2)[1] : null;
          return (
            <div key={b.level.id}>
              <button
                type="button"
                onClick={() => focusLevel(b.level.id)}
                className="absolute left-2 -translate-y-1/2 rounded px-1.5 py-1 text-left hover:bg-white/5"
                style={{ top: py, width: GUTTER_PX - 16, borderLeft: `3px solid ${color}` }}
              >
                <div className="flex items-center gap-1.5 text-[12px] font-bold leading-tight" style={{ color }}>
                  {b.level.label}
                  {alarm && <span className="h-2 w-2 animate-pulse rounded-full bg-status-critical" />}
                </div>
                <div className="text-[10px] leading-tight text-slate-400">
                  {b.level.depth_m === 0 ? "surface" : `${Math.abs(b.level.depth_m)} m below surface`}
                </div>
                <div className="text-[10px] leading-tight text-slate-500">
                  {miners.length} miner{miners.length === 1 ? "" : "s"}
                  {trucks ? ` · ${trucks} vehicle${trucks === 1 ? "" : "s"}` : ""}
                </div>
              </button>
              {next && gapPx !== null && gapPx > 0 && gapPx < size.h && (
                <div className="pointer-events-none absolute left-3 -translate-y-1/2 text-[9px] text-slate-600"
                     style={{ top: gapPx }}>
                  ↕ {Math.round(b.level.depth_m - next.level.depth_m)} m
                </div>
              )}
            </div>
          );
        })}

        {showLegend && (
          <div
            className={`absolute overflow-y-auto border-border/50 bg-black/70 px-2.5 py-2 text-[10px] text-slate-300 ${
              legendDocked
                ? "inset-y-0 right-0 border-l"
                : "pointer-events-none bottom-2 right-2 max-w-[340px] rounded-md border"
            }`}
            style={legendDocked ? { width: LEGEND_PX } : undefined}
          >
            <div className="mb-1 font-semibold text-slate-200">{mine.name}</div>
            <div className="mb-1.5 text-slate-500">
              Levels stacked by depth (evenly spaced) · east → right, north → up within a level
            </div>
            <div className={`grid gap-x-3 gap-y-0.5 ${legendDocked ? "grid-cols-1" : "grid-cols-2"}`}>
              <LegendItem color={STATUS_COLOR.NORMAL} label="Miner · normal" shape="dot" />
              <LegendItem color={STATUS_COLOR.WARNING} label="Miner · warning" shape="dot" />
              <LegendItem color={STATUS_COLOR.CRITICAL} label="Miner · critical" shape="dot" />
              <LegendItem color="#ca8a04" label="Vehicle (fill = load)" shape="box" />
              <LegendItem color="#3b82f6" label="Gateway" shape="box" />
              <LegendItem color="#fb7185" label="Restricted zone" shape="ring" />
              {legend.map((item) => (
                <LegendItem key={item.label} color={item.color} label={item.label} shape={item.shape} />
              ))}
            </div>
          </div>
        )}

        {focusWorker && (
          <WorkerStatusCard
            worker={focusWorker}
            telemetry={telemetryByTag[focusWorker.wearable_id]}
            position={positionByTag[focusWorker.wearable_id]}
            alerts={alerts}
            tracking={trackingId === focusWorker.worker_id}
            onClose={() => onSelectWorker(null)}
            onTrack={() => onStartTracking(focusWorker.worker_id)}
            onStopTrack={onStopTracking}
          />
        )}

        {focusVehicle && (
          <VehicleStatusCard
            vehicle={focusVehicle}
            tracking={trackedVehicleId === focusVehicle.vehicle_id}
            onClose={() => onSelectVehicle?.(null)}
            onTrack={() => onStartTrackingVehicle?.(focusVehicle.vehicle_id)}
            onStopTrack={onStopTracking}
            onSelectDriver={(id) => onSelectWorker(id)}
          />
        )}
      </div>
    </div>
  );
}

function vehicleLabel(v: Vehicle): string {
  const driver = v.driver_worker_id ? ` · ${v.driver_worker_id}` : "";
  return `${v.vehicle_id}${driver}`;
}

function LevelButton({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-1 text-[10px] font-semibold ${
        active ? "bg-slate-600 text-white" : "bg-panel text-slate-400 hover:text-slate-200"
      }`}
      style={color ? { borderLeft: `3px solid ${color}` } : undefined}
    >
      {label}
    </button>
  );
}

function ToolButton({ onClick, title, children }: { onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="rounded bg-panel px-2 py-1 text-[10px] font-semibold text-slate-300 hover:text-white"
    >
      {children}
    </button>
  );
}

export function LegendItem({ color, label, shape }: { color: string; label: string; shape: "dot" | "line" | "dash" | "box" | "ring" }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <svg width="16" height="10" className="shrink-0">
        {shape === "dot" && <circle cx="8" cy="5" r="4" fill={color} />}
        {shape === "box" && <rect x="3" y="1" width="10" height="8" rx="1.5" fill={color} />}
        {shape === "ring" && <ellipse cx="8" cy="5" rx="6.5" ry="3.8" fill={color} fillOpacity={0.15} stroke={color} strokeDasharray="2 1.5" />}
        {shape === "line" && <line x1="1" y1="5" x2="15" y2="5" stroke={color} strokeWidth="3" strokeLinecap="round" />}
        {shape === "dash" && <line x1="1" y1="5" x2="15" y2="5" stroke={color} strokeWidth="2.5" strokeDasharray="3 2" />}
      </svg>
      {label}
    </span>
  );
}
