import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Alert, Gateway, Geofence, MineGraph, PositionEstimate, Telemetry, Vehicle, Worker } from "../types";
import { STATUS_COLOR, workerDisplayStatus } from "../services/status";
import {
  NODE_STYLE, declutter, edgeColor, isVerticalEdge, levelColor, mineLegend, textWidth, type LabelBox,
} from "./mineStyle";
import { LegendItem } from "./MineSection";
import VehicleStatusCard from "./VehicleStatusCard";

interface Props {
  mine: MineGraph | null;
  workers: Record<string, Worker>;
  vehicles?: Record<string, Vehicle>;
  geofences?: Geofence[];
  gateways: Record<string, Gateway>;
  alerts: Record<string, Alert>;
  telemetryByTag: Record<string, Telemetry>;
  positionByTag: Record<string, PositionEstimate>;
  selectedWorkerId: string | null;
  trackingId: string | null;
  focusGatewayId?: string | null;
  onSelectWorker: (id: string) => void;
  onStartTracking: (id: string) => void;
  onStopTracking: () => void;
  selectedVehicleId?: string | null;
  trackedVehicleId?: string | null;
  onSelectVehicle?: (id: string | null) => void;
  onStartTrackingVehicle?: (id: string) => void;
}

const PADDING = 50;
const FIT_PADDING = 45;
const LERP = 0.28;
const MAX_STEP = 1.2;
/** Visible width (world metres) at zoom = 1; height follows the panel's aspect ratio */
const BASE_VIEW_W = 520;
const ZOOM_MIN = 0.08;
const ZOOM_MAX = 4;
const ZOOM_FACTOR = 1.2;
/** Camera ease toward tracked miner (lower = smoother slide) */
const CAMERA_LERP = 0.07;
const CAMERA_SNAP = 0.15;
const VEHICLE_MOTION = "transform 0.8s linear";
/** People/vehicles further than this above or below a level are in a shaft or raise, not on it */
const ON_LEVEL_TOLERANCE_M = 30;

type XY = { x: number; y: number };

/** Plan coordinates: east → right, north → up (SVG y grows downward, so y = −north). */
function planPoint(p: { x: number; z?: number }): XY {
  return { x: p.x, y: -(p.z ?? 0) };
}

function defaultLevel(mine: MineGraph | null): string {
  const underground = [...(mine?.levels ?? [])].filter((l) => l.depth_m < 0).sort((a, b) => b.depth_m - a.depth_m);
  return underground[0]?.id ?? "ALL";
}

export default function MineMap({
  mine, workers, vehicles = {}, geofences = [], gateways, alerts, telemetryByTag, positionByTag,
  selectedWorkerId, trackingId, focusGatewayId = null,
  onSelectWorker, onStartTracking, onStopTracking,
  selectedVehicleId = null, trackedVehicleId = null, onSelectVehicle, onStartTrackingVehicle,
}: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<string>(() => defaultLevel(mine));
  const [showLegend, setShowLegend] = useState(true);
  const [displayPos, setDisplayPos] = useState<Record<string, XY>>({});
  const [pan, setPan] = useState<XY>({ x: -260, y: -200 });
  const [zoom, setZoom] = useState(0.55);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [px, setPx] = useState({ w: 900, h: 420 });
  const targetsRef = useRef<Record<string, XY>>({});
  const displayRef = useRef<Record<string, XY>>({});
  const panRef = useRef<XY>({ x: -260, y: -200 });
  const panTargetRef = useRef<XY | null>(null);
  const trackingIdRef = useRef<string | null>(null);
  const vehicleTargetRef = useRef<XY | null>(null);
  const dragRef = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);
  const levelChosenRef = useRef(false);
  const panLimitsRef = useRef({ minPanX: 0, maxPanX: 0, minPanY: 0, maxPanY: 0 });
  const viewRef = useRef({ w: BASE_VIEW_W, h: BASE_VIEW_W * 0.5 });

  const aspect = px.h / px.w;
  const viewW = BASE_VIEW_W / zoom;
  const viewH = viewW * aspect;
  viewRef.current = { w: viewW, h: viewH };
  /** World metres per screen pixel — used to keep markers and text a constant on-screen size */
  const k = viewW / px.w;

  const focusId = pinnedId ?? hoveredId ?? selectedWorkerId ?? trackingId;
  trackingIdRef.current = trackingId;
  const trackedVehicle = trackedVehicleId ? vehicles[trackedVehicleId] ?? null : null;
  vehicleTargetRef.current = trackedVehicle ? planPoint(trackedVehicle) : null;
  const anyTracking = !!(trackingId || trackedVehicleId);

  useLayoutEffect(() => {
    if (!container) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setPx({ w: width, h: height });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [container]);

  // Mine may arrive after mount — pick the default level once it does
  useEffect(() => {
    if (mine && !levelChosenRef.current) setLevelFilter(defaultLevel(mine));
  }, [mine]);

  useEffect(() => {
    const next: Record<string, XY> = {};
    for (const w of Object.values(workers)) {
      next[w.worker_id] = planPoint(w);
      if (!displayRef.current[w.worker_id]) displayRef.current[w.worker_id] = planPoint(w);
    }
    targetsRef.current = next;
  }, [workers]);

  const clampPan = (x: number, y: number) => {
    const lim = panLimitsRef.current;
    return {
      x: Math.min(lim.maxPanX, Math.max(lim.minPanX, x)),
      y: Math.min(lim.maxPanY, Math.max(lim.minPanY, y)),
    };
  };

  // Smooth camera + miner motion on one RAF loop
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const targets = targetsRef.current;
      const cur = displayRef.current;
      let minersChanged = false;
      const nextMiners: Record<string, XY> = { ...cur };
      for (const [id, t] of Object.entries(targets)) {
        const p = cur[id] ?? t;
        const dx = t.x - p.x;
        const dy = t.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.02) {
          const scale = dist > MAX_STEP ? MAX_STEP / dist : LERP;
          nextMiners[id] = { x: p.x + dx * scale, y: p.y + dy * scale };
          minersChanged = true;
        } else {
          nextMiners[id] = t;
        }
      }
      displayRef.current = nextMiners;
      if (minersChanged) setDisplayPos(nextMiners);

      const tid = trackingIdRef.current;
      const followPos = tid ? (nextMiners[tid] ?? targets[tid]) : vehicleTargetRef.current;
      const following = !!(tid || vehicleTargetRef.current);
      if (followPos) {
        const { w: vw, h: vh } = viewRef.current;
        panTargetRef.current = clampPan(followPos.x - vw / 2, followPos.y - vh / 2);
      }

      const target = panTargetRef.current;
      if (target && !dragRef.current) {
        const p = panRef.current;
        const dx = target.x - p.x;
        const dy = target.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.05) {
          const t = dist > 80 ? CAMERA_SNAP : CAMERA_LERP;
          const nextPan = { x: p.x + dx * t, y: p.y + dy * t };
          panRef.current = nextPan;
          setPan(nextPan);
        } else {
          panRef.current = target;
          setPan(target);
          if (!following) panTargetRef.current = null;
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nodeById = useMemo(
    () => Object.fromEntries((mine?.nodes ?? []).map((n) => [n.id, n])),
    [mine],
  );

  const world = useMemo(() => {
    if (!mine) return null;
    const pts = mine.nodes.map(planPoint);
    for (const p of mine.portals ?? []) {
      const n = nodeById[p.node_id];
      if (n) pts.push(planPoint({ x: n.x + p.dx, z: (n.z ?? 0) + (p.dz ?? 0) }));
    }
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return {
      minX: Math.min(...xs) - PADDING,
      maxX: Math.max(...xs) + PADDING,
      minY: Math.min(...ys) - PADDING,
      maxY: Math.max(...ys) + PADDING,
    };
  }, [mine, nodeById]);

  // The view centre may go anywhere inside the mine footprint
  const panLimits = useMemo(() => {
    if (!world) return { minPanX: 0, maxPanX: 0, minPanY: 0, maxPanY: 0 };
    return {
      minPanX: world.minX - viewW / 2,
      maxPanX: world.maxX - viewW / 2,
      minPanY: world.minY - viewH / 2,
      maxPanY: world.maxY - viewH / 2,
    };
  }, [world, viewW, viewH]);
  panLimitsRef.current = panLimits;

  const fitToLevel = (levelId: string) => {
    if (!mine) return;
    const nodes = levelId === "ALL" ? mine.nodes : mine.nodes.filter((n) => n.level_id === levelId);
    if (!nodes.length) return;
    const depth = mine.levels?.find((l) => l.id === levelId)?.depth_m;
    const crew = Object.values(workers).filter(
      (w) => levelId === "ALL" || (w.level === levelId && (depth === undefined || Math.abs(w.y - depth) <= ON_LEVEL_TOLERANCE_M)),
    );
    const pts = [...nodes.map(planPoint), ...crew.map(planPoint)];
    const x0 = Math.min(...pts.map((p) => p.x)) - FIT_PADDING;
    const x1 = Math.max(...pts.map((p) => p.x)) + FIT_PADDING;
    const y0 = Math.min(...pts.map((p) => p.y)) - FIT_PADDING;
    const y1 = Math.max(...pts.map((p) => p.y)) + FIT_PADDING;
    const needW = Math.max(x1 - x0, (y1 - y0) / aspect);
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, BASE_VIEW_W / needW));
    const w = BASE_VIEW_W / z;
    const h = w * aspect;
    const next = { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2 };
    setZoom(z);
    panTargetRef.current = null;
    panRef.current = next;
    setPan(next);
  };

  // Frame the chosen level whenever it changes or the panel is resized
  useEffect(() => {
    if (trackingIdRef.current || vehicleTargetRef.current) return;
    fitToLevel(levelFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, levelFilter, px.w, px.h]);

  // When tracking starts / switches — set a slide target (no hard jump)
  useEffect(() => {
    if (!trackingId) return;
    setPinnedId(trackingId);
    const w = workers[trackingId];
    if (!w) return;
    if (levelFilter !== "ALL" && w.level && w.level !== levelFilter) setLevelFilter("ALL");
    const pos = displayRef.current[trackingId] ?? planPoint(w);
    panTargetRef.current = clampPan(pos.x - viewW / 2, pos.y - viewH / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackingId, workers, viewW, viewH]);

  // Slide camera to a searched gateway
  useEffect(() => {
    if (!focusGatewayId) return;
    const g = gateways[focusGatewayId];
    if (!g) return;
    if (levelFilter !== "ALL" && g.level_id && g.level_id !== levelFilter) setLevelFilter(g.level_id);
    const p = planPoint(g);
    panTargetRef.current = clampPan(p.x - viewW / 2, p.y - viewH / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusGatewayId, gateways, viewW, viewH]);

  // A tracked vehicle drags the plan along to whichever level it drives onto
  const trackedVehicleLevel = trackedVehicle?.level ?? null;
  useEffect(() => {
    if (!trackedVehicleId) return;
    setPinnedId(null);
    if (trackedVehicleLevel && levelFilter !== "ALL" && trackedVehicleLevel !== levelFilter) {
      setLevelFilter(trackedVehicleLevel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedVehicleId, trackedVehicleLevel]);

  useEffect(() => {
    if (selectedVehicleId) setPinnedId(null);
  }, [selectedVehicleId]);

  useEffect(() => {
    if (trackingId && !workers[trackingId]) onStopTracking();
    if (trackedVehicleId && !vehicles[trackedVehicleId]) onStopTracking();
  }, [trackingId, trackedVehicleId, workers, vehicles, onStopTracking]);

  if (!mine || !world) {
    return (
      <div ref={setContainer} className="flex h-full items-center justify-center text-slate-500">
        Loading mine layout…
      </div>
    );
  }

  const focusWorker = focusId ? workers[focusId] : null;
  const focusPos = focusWorker ? (displayPos[focusWorker.worker_id] ?? planPoint(focusWorker)) : null;
  const trackedWorker = trackingId ? workers[trackingId] : null;
  const levels = mine.levels ?? [];
  const onLevel = (levelId: string | null | undefined) => levelFilter === "ALL" || levelId === levelFilter;
  const levelDepth = levels.find((l) => l.id === levelFilter)?.depth_m;
  const onLevelNow = (e: { level?: string; y: number }) =>
    onLevel(e.level) && (levelDepth === undefined || Math.abs(e.y - levelDepth) <= ON_LEVEL_TOLERANCE_M);
  const toPx = (p: XY): XY => ({ x: (p.x - pan.x) / k, y: (p.y - pan.y) / k });

  const chooseLevel = (levelId: string) => {
    levelChosenRef.current = true;
    if (anyTracking) onStopTracking();
    setLevelFilter(levelId);
    if (levelId === levelFilter) fitToLevel(levelId);
  };

  const levelEdges = mine.edges.filter((e) => {
    if (isVerticalEdge(e)) return false;
    if (levelFilter === "ALL") return true;
    if (e.level_id) return e.level_id === levelFilter;
    return nodeById[e.start]?.level_id === levelFilter || nodeById[e.end]?.level_id === levelFilter;
  });
  // Inclined raises still show as a dashed line in plan; vertical shafts collapse to their station
  const raiseEdges = mine.edges.filter((e) => {
    if (!isVerticalEdge(e)) return false;
    const a = nodeById[e.start];
    const b = nodeById[e.end];
    if (!a || !b || Math.hypot(a.x - b.x, (a.z ?? 0) - (b.z ?? 0)) < 8) return false;
    return levelFilter === "ALL" || a.level_id === levelFilter || b.level_id === levelFilter;
  });
  const facilities = mine.nodes.filter((n) => NODE_STYLE[n.type] && onLevel(n.level_id));
  const visibleWorkers = Object.values(workers).filter((w) => !w.assigned_vehicle_id && onLevelNow(w));
  const visibleVehicles = Object.values(vehicles).filter(
    (v) => onLevelNow(v) || v.vehicle_id === trackedVehicleId || v.vehicle_id === selectedVehicleId,
  );
  const vehicleFocusId = selectedVehicleId ?? trackedVehicleId;
  const focusVehicle = vehicleFocusId && !selectedWorkerId ? vehicles[vehicleFocusId] ?? null : null;
  const driverVehicleId = trackedWorker?.assigned_vehicle_id ?? null;

  const labels: LabelBox[] = [];
  for (const n of facilities) {
    const p = toPx(planPoint(n));
    const text = NODE_STYLE[n.type].label;
    labels.push({ id: `n:${n.id}`, x: p.x + 8, y: p.y - 7, w: textWidth(text, 10), h: 13, priority: NODE_STYLE[n.type].priority });
  }
  for (const v of visibleVehicles) {
    const p = toPx(planPoint(v));
    const picked = v.vehicle_id === vehicleFocusId;
    labels.push({ id: `v:${v.vehicle_id}`, x: p.x + 11, y: p.y - 8, w: textWidth(v.vehicle_id, 10), h: 14, priority: picked ? 320 : 150 });
  }
  for (const w of visibleWorkers) {
    const p = toPx(displayPos[w.worker_id] ?? planPoint(w));
    const urgent = workerDisplayStatus(w, alerts) !== "NORMAL" || w.worker_id === focusId;
    labels.push({ id: `w:${w.worker_id}`, x: p.x + 9, y: p.y - 7, w: textWidth(w.worker_id, 11), h: 14, priority: urgent ? 300 : 200 });
  }
  const shown = declutter(labels);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as Element).closest?.("[data-miner],[data-vehicle]")) return;
    if (anyTracking) onStopTracking();
    panTargetRef.current = null;
    dragRef.current = { ox: e.clientX, oy: e.clientY, px: panRef.current.x, py: panRef.current.y };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragRef.current) return;
    const next = clampPan(
      dragRef.current.px - (e.clientX - dragRef.current.ox) * k,
      dragRef.current.py - (e.clientY - dragRef.current.oy) * k,
    );
    panRef.current = next;
    setPan(next);
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const setPanManual = (next: XY) => {
    if (anyTracking) onStopTracking();
    panTargetRef.current = null;
    panRef.current = next;
    setPan(next);
  };

  const applyZoom = (nextZoom: number) => {
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextZoom));
    const newW = BASE_VIEW_W / z;
    const newH = newW * aspect;
    const cx = panRef.current.x + viewW / 2;
    const cy = panRef.current.y + viewH / 2;
    setZoom(z);
    const tentative = { x: cx - newW / 2, y: cy - newH / 2 };
    panTargetRef.current = null;
    panRef.current = tentative;
    setPan(tentative);
  };

  const offScreenCount = visibleWorkers.filter((w) => {
    const p = displayPos[w.worker_id] ?? planPoint(w);
    return p.x < pan.x || p.x > pan.x + viewW || p.y < pan.y || p.y > pan.y + viewH;
  }).length;
  const hiddenElsewhere = levelFilter === "ALL"
    ? 0
    : Object.values(workers).filter((w) => !onLevelNow(w)).length;
  const legend = mineLegend(mine);

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-1 text-[10px] uppercase tracking-wider text-slate-500">
        <span className="mr-0.5">Level</span>
        {levels.map((lv) => (
          <button
            key={lv.id}
            type="button"
            onClick={() => chooseLevel(lv.id)}
            className={`rounded px-2 py-1 text-[10px] font-semibold normal-case tracking-normal ${
              levelFilter === lv.id ? "bg-slate-600 text-white" : "bg-panel text-slate-400 hover:text-slate-200"
            }`}
            style={{ borderLeft: `3px solid ${levelColor(lv.id)}` }}
          >
            {lv.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => chooseLevel("ALL")}
          className={`rounded px-2 py-1 text-[10px] font-semibold normal-case tracking-normal ${
            levelFilter === "ALL" ? "bg-slate-600 text-white" : "bg-panel text-slate-400 hover:text-slate-200"
          }`}
          title="Overlay every level in one plan (levels sit on top of each other)"
        >
          All overlaid
        </button>
        {hiddenElsewhere > 0 && (
          <span className="normal-case tracking-normal text-slate-500">
            {hiddenElsewhere} miner{hiddenElsewhere === 1 ? "" : "s"} on other levels or in shafts
          </span>
        )}
        {offScreenCount > 0 && !anyTracking && (
          <span className="rounded bg-status-warning/20 px-1.5 py-0.5 normal-case tracking-normal text-status-warning">
            {offScreenCount} off-screen
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {trackedWorker && (
            <>
              <span className="rounded bg-sky-500/20 px-1.5 py-0.5 font-semibold normal-case tracking-normal text-sky-300">
                Tracking {trackedWorker.worker_id} · {trackedWorker.name}
              </span>
              <button
                type="button"
                onClick={onStopTracking}
                className="rounded bg-panel px-2 py-1 text-[10px] font-semibold text-slate-300 hover:text-white"
              >
                Stop
              </button>
            </>
          )}
          {trackedVehicle && (
            <>
              <span className="rounded bg-sky-500/20 px-1.5 py-0.5 font-semibold normal-case tracking-normal text-sky-300">
                Tracking {trackedVehicle.vehicle_id}
                {trackedVehicle.driver_name ? ` · ${trackedVehicle.driver_name}` : ""}
              </span>
              <button
                type="button"
                onClick={onStopTracking}
                className="rounded bg-panel px-2 py-1 text-[10px] font-semibold text-slate-300 hover:text-white"
              >
                Stop
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => applyZoom(zoom / ZOOM_FACTOR)}
            disabled={zoom <= ZOOM_MIN}
            className="rounded bg-panel px-2 py-1 text-[10px] font-semibold text-slate-300 hover:text-white disabled:opacity-40"
            title="Zoom out"
          >
            −
          </button>
          <span className="w-10 text-center font-mono text-[10px] text-slate-400">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => applyZoom(zoom * ZOOM_FACTOR)}
            disabled={zoom >= ZOOM_MAX}
            className="rounded bg-panel px-2 py-1 text-[10px] font-semibold text-slate-300 hover:text-white disabled:opacity-40"
            title="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => {
              if (anyTracking) onStopTracking();
              fitToLevel(levelFilter);
            }}
            className="rounded bg-panel px-2 py-1 text-[10px] font-semibold normal-case tracking-normal text-slate-300 hover:text-white"
            title="Fit the selected level to the panel"
          >
            Fit
          </button>
          <button
            type="button"
            onClick={() => setShowLegend((s) => !s)}
            className="rounded bg-panel px-2 py-1 text-[10px] font-semibold normal-case tracking-normal text-slate-300 hover:text-white"
          >
            {showLegend ? "Hide legend" : "Legend"}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-1.5">
      <div ref={setContainer} className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded border border-border/60 bg-[#0a0e13]">
        <svg
          viewBox={`${pan.x} ${pan.y} ${viewW} ${viewH}`}
          className="absolute inset-0 h-full w-full cursor-grab select-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={(e) => applyZoom(e.deltaY < 0 ? zoom * 1.12 : zoom / 1.12)}
          onClick={() => setPinnedId(null)}
        >
          {(mine.portals ?? []).map((p) => {
            const n = nodeById[p.node_id];
            if (!n || !onLevel(n.level_id)) return null;
            const a = planPoint(n);
            const b = planPoint({ x: n.x + p.dx, z: (n.z ?? 0) + (p.dz ?? 0) });
            return (
              <g key={`portal-${p.node_id}`}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke="#3d4f61" strokeWidth={4} strokeLinecap="round"
                      strokeDasharray="6 6" opacity={0.75} vectorEffect="non-scaling-stroke" />
                <text x={b.x} y={b.y - 8 * k} fontSize={10 * k} fill="#6b7c8d" textAnchor="middle">{p.label}</text>
              </g>
            );
          })}

          {geofences.flatMap((f) =>
            f.nodes.filter((n) => onLevel(n.level_id)).map((n) => {
              const c = planPoint(n);
              const color = f.severity === "CRITICAL" ? "#fb7185" : "#fbbf24";
              return (
                <circle key={`${f.fence_id}-${n.id}`} cx={c.x} cy={c.y} r={Math.max(f.radius_m, 10 * k)}
                        fill={color} fillOpacity={0.12} stroke={color} strokeOpacity={0.75} strokeWidth={1.2}
                        strokeDasharray="4 3" vectorEffect="non-scaling-stroke">
                  <title>{`${f.name} — ${f.message}`}</title>
                </circle>
              );
            }),
          )}

          {raiseEdges.map((e) => {
            const a = planPoint(nodeById[e.start]);
            const b = planPoint(nodeById[e.end]);
            return (
              <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={edgeColor(e, nodeById)}
                    strokeWidth={2} strokeDasharray="5 4" opacity={0.7} vectorEffect="non-scaling-stroke" />
            );
          })}

          {levelEdges.map((e) => {
            const a = nodeById[e.start];
            const b = nodeById[e.end];
            if (!a || !b) return null;
            const pa = planPoint(a);
            const pb = planPoint(b);
            return (
              <line key={`case-${e.id}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                    stroke="#0a0e13" strokeWidth={9} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            );
          })}
          {levelEdges.map((e) => {
            const a = nodeById[e.start];
            const b = nodeById[e.end];
            if (!a || !b) return null;
            const pa = planPoint(a);
            const pb = planPoint(b);
            const ramp = e.kind === "ramp";
            return (
              <line key={e.id} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                    stroke={edgeColor(e, nodeById)} strokeWidth={ramp ? 3.5 : 5}
                    strokeDasharray={ramp ? "10 4" : undefined} strokeLinecap="round" opacity={0.85}
                    vectorEffect="non-scaling-stroke">
                <title>{`${e.id} · ${e.zone_id}`}</title>
              </line>
            );
          })}

          {facilities.map((n) => {
            const p = planPoint(n);
            const style = NODE_STYLE[n.type];
            const station = n.type === "lift_station" || n.type === "surface";
            const s = 5 * k;
            return (
              <g key={n.id}>
                {station ? (
                  <>
                    <circle cx={p.x} cy={p.y} r={s * 1.9} fill="none" stroke={style.color} strokeOpacity={0.5}
                            strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
                    <rect x={p.x - s} y={p.y - s} width={s * 2} height={s * 2} rx={1.5 * k} fill={style.color}
                          stroke="#0a0e13" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                  </>
                ) : (
                  <circle cx={p.x} cy={p.y} r={s} fill={style.color} stroke="#0a0e13" strokeWidth={1.5}
                          vectorEffect="non-scaling-stroke" />
                )}
                <title>{`${style.label} · ${n.id}`}</title>
                {shown.has(`n:${n.id}`) && (
                  <text x={p.x + 8 * k} y={p.y + 3.5 * k} fontSize={10 * k} fill={style.color}
                        style={{ paintOrder: "stroke" }} stroke="#0a0e13" strokeWidth={3 * k}>
                    {style.label}
                  </text>
                )}
              </g>
            );
          })}

          {Object.values(gateways).map((g) => {
            if (!onLevel(g.level_id)) return null;
            const focused = g.gateway_id === focusGatewayId;
            const p = planPoint(g);
            const s = (focused ? 4 : 2.8) * k;
            return (
              <g key={g.gateway_id}>
                {focused && (
                  <circle cx={p.x} cy={p.y} r={12 * k} fill="none" stroke="#38bdf8" strokeWidth={1.4}
                          strokeDasharray="3 2" vectorEffect="non-scaling-stroke">
                    <animate attributeName="stroke-dashoffset" values="0;10" dur="1s" repeatCount="indefinite" />
                  </circle>
                )}
                <rect x={p.x - s} y={p.y - s} width={s * 2} height={s * 2}
                      fill={g.status === "ONLINE" ? "#3b82f6" : "#f13c3c"}
                      opacity={g.status === "ONLINE" && !focused ? 0.6 : 1}>
                  <title>{`${g.gateway_id} · ${g.status}`}</title>
                </rect>
                {focused && (
                  <text x={p.x} y={p.y + 22 * k} fontSize={10 * k} fill="#7dd3fc" textAnchor="middle">{g.gateway_id}</text>
                )}
              </g>
            );
          })}

          {visibleVehicles.map((v) => {
            const p = planPoint(v);
            const fill = Math.max(0, Math.min(1, v.cargo_fill ?? 0));
            const w = 16 * k;
            const h = 9 * k;
            const tracking = v.vehicle_id === trackedVehicleId || v.vehicle_id === driverVehicleId;
            const selected = v.vehicle_id === selectedVehicleId;
            return (
              <g
                key={v.vehicle_id}
                data-vehicle={v.vehicle_id}
                className="cursor-pointer"
                style={{ transform: `translate(${p.x}px, ${p.y}px)`, transition: VEHICLE_MOTION }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectVehicle?.(v.vehicle_id);
                }}
              >
                <circle r={w} fill="transparent" />
                {tracking && (
                  <circle r={w * 1.05} fill="none" stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="3 2"
                          vectorEffect="non-scaling-stroke">
                    <animate attributeName="stroke-dashoffset" values="0;10" dur="1s" repeatCount="indefinite" />
                  </circle>
                )}
                {selected && !tracking && (
                  <circle r={w * 0.95} fill="none" stroke="#ffffff" strokeWidth={1.4} opacity={0.85}
                          vectorEffect="non-scaling-stroke" />
                )}
                <g transform={`rotate(${(v.heading_deg ?? 0) - 90})`}>
                  <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={2 * k}
                        fill={v.kind === "lhd" ? "#ca8a04" : "#a16207"} stroke="#fde68a" strokeWidth={1.2}
                        vectorEffect="non-scaling-stroke" />
                  <rect x={-w / 2 + 2 * k} y={-h / 2 + 2 * k} width={(w - 4 * k) * fill} height={h - 4 * k}
                        fill="#451a03" opacity={0.8} />
                </g>
                <title>{`${v.vehicle_id} · ${v.driver_name ?? "no driver"} · ${v.activity ?? v.phase}`}</title>
                {shown.has(`v:${v.vehicle_id}`) && (
                  <text x={11 * k} y={4 * k} fontSize={10 * k} fontWeight={700} fill={tracking ? "#7dd3fc" : "#fde68a"}
                        style={{ paintOrder: "stroke" }} stroke="#0a0e13" strokeWidth={3 * k}>
                    {tracking ? `▶ ${v.vehicle_id}` : v.vehicle_id}
                  </text>
                )}
              </g>
            );
          })}

          {visibleWorkers.map((w) => {
            const status = workerDisplayStatus(w, alerts);
            const selected = w.worker_id === selectedWorkerId || w.worker_id === focusId;
            const tracking = w.worker_id === trackingId;
            const vibrating = !!w.watch_vibrating;
            const pos = displayPos[w.worker_id] ?? planPoint(w);
            const critical = status === "CRITICAL";
            const color = vibrating ? "#fb7185" : STATUS_COLOR[status];
            const r = 6.5 * k;
            return (
              <g
                key={w.worker_id}
                data-miner={w.worker_id}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredId(w.worker_id)}
                onMouseLeave={() => setHoveredId((id) => (id === w.worker_id ? null : id))}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectWorker(w.worker_id);
                  setPinnedId(w.worker_id);
                }}
              >
                {(tracking || vibrating) && (
                  <circle cx={pos.x} cy={pos.y} r={r * 2} fill="none"
                          stroke={vibrating ? "#fb7185" : "#38bdf8"}
                          strokeWidth={1.5} strokeDasharray="3 2" vectorEffect="non-scaling-stroke">
                    <animate attributeName="stroke-dashoffset" values="0;10" dur="1s" repeatCount="indefinite" />
                  </circle>
                )}
                {selected && !tracking && (
                  <circle cx={pos.x} cy={pos.y} r={r * 1.6} fill="none" stroke="#ffffff" strokeWidth={1.4}
                          opacity={0.85} vectorEffect="non-scaling-stroke" />
                )}
                {critical && (
                  <circle cx={pos.x} cy={pos.y} r={r * 1.8} fill="none" stroke={STATUS_COLOR.CRITICAL} strokeWidth={1.5}
                          vectorEffect="non-scaling-stroke">
                    <animate attributeName="r" values={`${r * 1.3};${r * 2.3};${r * 1.3}`} dur="0.9s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.9;0.2;0.9" dur="0.9s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx={pos.x} cy={pos.y} r={r} fill={color} stroke="#0a0e13" strokeWidth={1.8}
                        vectorEffect="non-scaling-stroke" />
                <circle cx={pos.x} cy={pos.y} r={r * 2} fill="transparent" />
                {shown.has(`w:${w.worker_id}`) && (
                  <text x={pos.x + 9 * k} y={pos.y + 4 * k} fontSize={11 * k} fontWeight={700}
                        fill={status === "NORMAL" ? "#e2e8f0" : color}
                        style={{ paintOrder: "stroke" }} stroke="#0a0e13" strokeWidth={3 * k}>
                    {w.worker_id}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-center text-[10px] font-bold text-slate-500">
          <span>N</span>
          <span className="leading-none">↑</span>
        </div>

        {focusWorker && focusPos && (
          <MinerMapCard
            worker={focusWorker}
            telemetry={telemetryByTag[focusWorker.wearable_id]}
            position={positionByTag[focusWorker.wearable_id]}
            alerts={alerts}
            pinned={pinnedId === focusWorker.worker_id}
            tracking={trackingId === focusWorker.worker_id}
            leftPct={((focusPos.x - pan.x) / viewW) * 100}
            topPct={((focusPos.y - pan.y) / viewH) * 100}
            onClose={() => setPinnedId(null)}
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
            onSelectDriver={(id) => {
              onSelectWorker(id);
              setPinnedId(id);
            }}
          />
        )}
      </div>
      {showLegend && (
        <aside className="hidden w-[200px] shrink-0 overflow-y-auto rounded border border-border/60 bg-black/40 px-2.5 py-2 text-[10px] text-slate-300 md:block">
          <div className="mb-1.5 font-semibold text-slate-200">
            {levelFilter === "ALL" ? "All levels overlaid" : levels.find((l) => l.id === levelFilter)?.label} · plan
          </div>
          <div className="grid grid-cols-1 gap-y-0.5">
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
        </aside>
      )}
      </div>

      <div className="shrink-0 space-y-1 px-1 pb-0.5">
        <label className="flex items-center gap-2 text-[10px] text-slate-500">
          <span className="w-10 shrink-0 uppercase tracking-wider">West</span>
          <input
            type="range"
            min={panLimits.minPanX}
            max={panLimits.maxPanX}
            step={1}
            value={pan.x}
            onChange={(e) => setPanManual({ ...pan, x: Number(e.target.value) })}
            className="h-1.5 w-full cursor-pointer accent-slate-400"
          />
          <span className="w-10 shrink-0 text-right uppercase tracking-wider">East</span>
        </label>
        <label className="flex items-center gap-2 text-[10px] text-slate-500">
          <span className="w-10 shrink-0 uppercase tracking-wider">North</span>
          <input
            type="range"
            min={panLimits.minPanY}
            max={panLimits.maxPanY}
            step={1}
            value={pan.y}
            onChange={(e) => setPanManual({ ...pan, y: Number(e.target.value) })}
            className="h-1.5 w-full cursor-pointer accent-slate-400"
          />
          <span className="w-10 shrink-0 text-right uppercase tracking-wider">South</span>
        </label>
      </div>
    </div>
  );
}

function MinerMapCard({
  worker, telemetry, position, alerts, pinned, tracking, leftPct, topPct,
  onClose, onTrack, onStopTrack,
}: {
  worker: Worker;
  telemetry?: Telemetry;
  position?: PositionEstimate;
  alerts: Record<string, Alert>;
  pinned: boolean;
  tracking: boolean;
  leftPct: number;
  topPct: number;
  onClose: () => void;
  onTrack: () => void;
  onStopTrack: () => void;
}) {
  const status = workerDisplayStatus(worker, alerts);
  if (leftPct < -5 || leftPct > 105 || topPct < -5 || topPct > 105) return null;
  const flipX = leftPct > 62;
  const flipY = topPct > 55;

  return (
    <div
      className="pointer-events-auto absolute z-20 w-56 rounded-lg border border-border bg-[#121820]/95 p-3 shadow-xl backdrop-blur-sm"
      style={{
        left: `${Math.min(92, Math.max(8, leftPct))}%`,
        top: `${Math.min(88, Math.max(8, topPct))}%`,
        transform: `translate(${flipX ? "-110%" : "12%"}, ${flipY ? "calc(-100% - 12px)" : "14px"})`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-mono text-sm font-bold text-slate-100">
            {worker.worker_id} — {worker.name}
          </div>
          <div className="text-[11px] text-slate-400">{worker.role}</div>
        </div>
        <div className="flex items-center gap-1">
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
            style={{ background: STATUS_COLOR[status] + "33", color: STATUS_COLOR[status] }}
          >
            {status}
          </span>
          {pinned && (
            <button type="button" onClick={onClose} className="rounded px-1 text-xs text-slate-400 hover:text-slate-200">
              ×
            </button>
          )}
        </div>
      </div>
      <div className="mb-2 text-[11px] text-slate-400">
        Zone <span className="font-mono text-slate-200">{position?.zone_id ?? worker.current_edge_id}</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <DetailStat label="Heart Rate" value={telemetry ? `${telemetry.hr} bpm` : "—"} />
        <DetailStat label="Blood Pressure" value={telemetry ? `${telemetry.bp_sys}/${telemetry.bp_dia}` : "—"} />
        <DetailStat label="SpO₂" value={telemetry ? `${telemetry.spo2} %` : "—"} />
        <DetailStat label="Ambient O₂" value={telemetry ? `${telemetry.o2_ambient} %` : "—"} />
        <DetailStat label="Methane" value={telemetry ? `${telemetry.ch4_lel} LEL` : "—"} />
        <DetailStat label="Battery" value={telemetry ? `${telemetry.battery_pct} %` : "—"} />
      </div>
      <button
        type="button"
        onClick={tracking ? onStopTrack : onTrack}
        className={`mt-2.5 w-full rounded px-2 py-1.5 text-xs font-semibold uppercase tracking-wider ${
          tracking
            ? "bg-sky-500/25 text-sky-200 hover:bg-sky-500/40"
            : "bg-slate-600/80 text-slate-100 hover:bg-slate-500"
        }`}
      >
        {tracking ? "Stop tracking" : "Track on map"}
      </button>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/50 bg-panel/80 px-1.5 py-1">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-mono text-xs font-semibold text-slate-100">{value}</div>
    </div>
  );
}
