import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Alert, Gateway, MineGraph, PositionEstimate, Telemetry, Worker } from "../types";
import { STATUS_COLOR, workerDisplayStatus } from "../services/status";

interface Props {
  mine: MineGraph | null;
  workers: Record<string, Worker>;
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
}

const PADDING = 50;
const LERP = 0.28;
const MAX_STEP = 1.2;
/** Base visible window (world metres) at zoom = 1 */
const BASE_VIEW_W = 220;
const BASE_VIEW_H = 180;
const ZOOM_MIN = 0.12;
const ZOOM_MAX = 3.5;
const ZOOM_STEP = 0.15;
/** Camera ease toward tracked miner (lower = smoother slide) */
const CAMERA_LERP = 0.07;
const CAMERA_SNAP = 0.15;

export default function MineMap({
  mine, workers, gateways, alerts, telemetryByTag, positionByTag,
  selectedWorkerId, trackingId, focusGatewayId = null,
  onSelectWorker, onStartTracking, onStopTracking,
}: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [displayPos, setDisplayPos] = useState<Record<string, { x: number; y: number }>>({});
  const [pan, setPan] = useState({ x: -40, y: 10 });
  const [zoom, setZoom] = useState(1);
  const targetsRef = useRef<Record<string, { x: number; y: number }>>({});
  const displayRef = useRef<Record<string, { x: number; y: number }>>({});
  const panRef = useRef({ x: -40, y: 10 });
  const panTargetRef = useRef<{ x: number; y: number } | null>(null);
  const trackingIdRef = useRef<string | null>(null);
  const dragRef = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const panLimitsRef = useRef({ minPanX: 0, maxPanX: 0, minPanY: 0, maxPanY: 0 });
  const viewRef = useRef({ w: BASE_VIEW_W, h: BASE_VIEW_H });

  const viewW = BASE_VIEW_W / zoom;
  const viewH = BASE_VIEW_H / zoom;
  viewRef.current = { w: viewW, h: viewH };

  const focusId = pinnedId ?? hoveredId ?? selectedWorkerId ?? trackingId;
  trackingIdRef.current = trackingId;

  useEffect(() => {
    const next: Record<string, { x: number; y: number }> = {};
    for (const w of Object.values(workers)) {
      next[w.worker_id] = { x: w.x, y: w.y };
      if (!displayRef.current[w.worker_id]) {
        displayRef.current[w.worker_id] = { x: w.x, y: w.y };
      }
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
      const nextMiners: Record<string, { x: number; y: number }> = { ...cur };
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

      // Soft-slide camera toward tracked miner (or pending pan target)
      const tid = trackingIdRef.current;
      if (tid) {
        const wPos = nextMiners[tid] ?? targets[tid];
        if (wPos) {
          const { w: vw, h: vh } = viewRef.current;
          panTargetRef.current = clampPan(wPos.x - vw / 2, wPos.y - vh / 2);
        }
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
          if (!tid) panTargetRef.current = null;
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const world = useMemo(() => {
    if (!mine) return null;
    const xs = mine.nodes.map((n) => n.x);
    const ys = mine.nodes.map((n) => n.y);
    for (const p of mine.portals ?? []) {
      const n = mine.nodes.find((node) => node.id === p.node_id);
      if (!n) continue;
      xs.push(n.x + p.dx);
      ys.push(n.y + p.dy);
    }
    return {
      minX: Math.min(...xs) - PADDING,
      maxX: Math.max(...xs) + PADDING,
      minY: Math.min(...ys) - PADDING,
      maxY: Math.max(...ys) + PADDING,
    };
  }, [mine]);

  const panLimits = useMemo(() => {
    if (!world) return { minPanX: 0, maxPanX: 0, minPanY: 0, maxPanY: 0 };
    return {
      minPanX: world.minX,
      maxPanX: Math.max(world.minX, world.maxX - viewW),
      minPanY: world.minY,
      maxPanY: Math.max(world.minY, world.maxY - viewH),
    };
  }, [world, viewW, viewH]);

  panLimitsRef.current = panLimits;

  // Keep pan valid when zoom changes
  useEffect(() => {
    const next = clampPan(panRef.current.x, panRef.current.y);
    panRef.current = next;
    setPan(next);
  }, [viewW, viewH]);

  // When tracking starts / switches — set a slide target (no hard jump)
  useEffect(() => {
    if (!trackingId) return;
    setPinnedId(trackingId);
    const w = workers[trackingId];
    if (!w) return;
    const pos = displayRef.current[trackingId] ?? { x: w.x, y: w.y };
    panTargetRef.current = clampPan(pos.x - viewW / 2, pos.y - viewH / 2);
  }, [trackingId, workers, viewW, viewH]);

  // Slide camera to a searched gateway
  useEffect(() => {
    if (!focusGatewayId) return;
    const g = gateways[focusGatewayId];
    if (!g) return;
    panTargetRef.current = clampPan(g.x - viewW / 2, g.y - viewH / 2);
  }, [focusGatewayId, gateways, viewW, viewH]);

  // Clear tracking if miner disappears
  useEffect(() => {
    if (trackingId && !workers[trackingId]) onStopTracking();
  }, [trackingId, workers, onStopTracking]);

  if (!mine || !world) {
    return <div className="flex h-full items-center justify-center text-slate-500">Loading mine layout…</div>;
  }

  const nodeById = Object.fromEntries(mine.nodes.map((n) => [n.id, n]));
  const focusWorker = focusId ? workers[focusId] : null;
  const focusPos = focusWorker
    ? (displayPos[focusWorker.worker_id] ?? { x: focusWorker.x, y: focusWorker.y })
    : null;
  const trackedWorker = trackingId ? workers[trackingId] : null;

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as Element).closest?.("[data-miner]")) return;
    if (trackingId) onStopTracking();
    panTargetRef.current = null;
    dragRef.current = { ox: e.clientX, oy: e.clientY, px: panRef.current.x, py: panRef.current.y };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragRef.current || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const sx = viewW / rect.width;
    const sy = viewH / rect.height;
    const dx = (e.clientX - dragRef.current.ox) * sx;
    const dy = (e.clientY - dragRef.current.oy) * sy;
    const next = clampPan(dragRef.current.px - dx, dragRef.current.py - dy);
    panRef.current = next;
    setPan(next);
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const setPanManual = (next: { x: number; y: number }) => {
    if (trackingId) onStopTracking();
    panTargetRef.current = null;
    panRef.current = next;
    setPan(next);
  };

  const applyZoom = (nextZoom: number) => {
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextZoom));
    const oldW = viewW;
    const oldH = viewH;
    const newW = BASE_VIEW_W / z;
    const newH = BASE_VIEW_H / z;
    const cx = panRef.current.x + oldW / 2;
    const cy = panRef.current.y + oldH / 2;
    setZoom(z);
    // panLimits update on next render; approximate clamp with world extents
    const tentative = { x: cx - newW / 2, y: cy - newH / 2 };
    panTargetRef.current = null;
    panRef.current = tentative;
    setPan(tentative);
  };

  const offScreenCount = Object.values(workers).filter((w) => {
    const p = displayPos[w.worker_id] ?? { x: w.x, y: w.y };
    return p.x < pan.x || p.x > pan.x + viewW || p.y < pan.y || p.y > pan.y + viewH;
  }).length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-1 text-[10px] uppercase tracking-wider text-slate-500">
        <span>Large mine · pan / zoom · {Object.keys(workers).length} miners</span>
        {offScreenCount > 0 && !trackingId && (
          <span className="rounded bg-status-warning/20 px-1.5 py-0.5 text-status-warning">
            {offScreenCount} off-screen
          </span>
        )}
        {trackedWorker ? (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="rounded bg-sky-500/20 px-1.5 py-0.5 font-semibold normal-case tracking-normal text-sky-300">
              Tracking {trackedWorker.worker_id} · {trackedWorker.name}
            </span>
            <button
              type="button"
              onClick={onStopTracking}
              className="rounded bg-panel px-2 py-0.5 text-[10px] font-semibold text-slate-300 hover:text-white"
            >
              Stop
            </button>
          </div>
        ) : (
          <span className="ml-auto normal-case tracking-normal text-slate-600">
            Click a miner → Track on map
          </span>
        )}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => applyZoom(zoom - ZOOM_STEP)}
            disabled={zoom <= ZOOM_MIN}
            className="rounded bg-panel px-2 py-0.5 text-[10px] font-semibold text-slate-300 hover:text-white disabled:opacity-40"
            title="Zoom out"
          >
            −
          </button>
          <span className="w-10 text-center font-mono text-[10px] text-slate-400">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => applyZoom(zoom + ZOOM_STEP)}
            disabled={zoom >= ZOOM_MAX}
            className="rounded bg-panel px-2 py-0.5 text-[10px] font-semibold text-slate-300 hover:text-white disabled:opacity-40"
            title="Zoom in"
          >
            +
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            if (trackingId) onStopTracking();
            setZoom(1);
            panTargetRef.current = null;
            const next = clampPan(-40, 10);
            panRef.current = next;
            setPan(next);
          }}
          className="rounded bg-panel px-2 py-0.5 text-[10px] font-semibold text-slate-400 hover:text-slate-200"
        >
          Reset view
        </button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded border border-border/60 bg-[#0a0e13]">
        <svg
          ref={svgRef}
          viewBox={`${pan.x} ${pan.y} ${viewW} ${viewH}`}
          className="h-full w-full cursor-grab active:cursor-grabbing"
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={(e) => {
            e.preventDefault();
            applyZoom(zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
          }}
          onClick={() => setPinnedId(null)}
        >
          {(mine.portals ?? []).map((p) => {
            const n = nodeById[p.node_id];
            if (!n) return null;
            const x2 = n.x + p.dx;
            const y2 = n.y + p.dy;
            return (
              <g key={`portal-${p.node_id}`}>
                <line x1={n.x} y1={n.y} x2={x2} y2={y2}
                      stroke="#3d4f61" strokeWidth={5} strokeLinecap="round"
                      strokeDasharray="3 4" opacity={0.75} />
                <text x={x2} y={y2 - 4} fontSize={4} fill="#6b7c8d" textAnchor="middle">∞</text>
              </g>
            );
          })}

          {mine.edges.map((e) => {
            const a = nodeById[e.start];
            const b = nodeById[e.end];
            return (
              <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke="#2c3a48" strokeWidth={6} strokeLinecap="round" />
            );
          })}

          {mine.nodes.map((n) => (
            <g key={n.id}>
              <circle cx={n.x} cy={n.y} r={n.type === "intersection" ? 2.5 : 5}
                      fill={nodeColor(n.type)} />
              {n.type !== "intersection" && (
                <text x={n.x} y={n.y - 8} fontSize={5} fill="#8a97a6" textAnchor="middle">
                  {n.id.replace(/_/g, " ")}
                </text>
              )}
            </g>
          ))}

          {Object.values(gateways).map((g) => {
            const focused = g.gateway_id === focusGatewayId;
            return (
              <g key={g.gateway_id}>
                {focused && (
                  <circle cx={g.x} cy={g.y} r={11} fill="none" stroke="#38bdf8" strokeWidth={1.4} strokeDasharray="3 2">
                    <animate attributeName="stroke-dashoffset" values="0;10" dur="1s" repeatCount="indefinite" />
                  </circle>
                )}
                <rect x={g.x - 3} y={g.y - 3} width={6} height={6}
                      fill={g.status === "ONLINE" ? "#3b82f6" : "#f13c3c"} opacity={0.85} />
                <text x={g.x} y={g.y + 10} fontSize={4}
                      fill={focused ? "#7dd3fc" : "#5c6b7a"} textAnchor="middle">{g.gateway_id}</text>
              </g>
            );
          })}

          {Object.values(workers).map((w) => {
            const status = workerDisplayStatus(w, alerts);
            const selected = w.worker_id === selectedWorkerId || w.worker_id === focusId;
            const tracking = w.worker_id === trackingId;
            const pos = displayPos[w.worker_id] ?? { x: w.x, y: w.y };
            const critical = status === "CRITICAL";
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
                {tracking && (
                  <circle cx={pos.x} cy={pos.y} r={12} fill="none" stroke="#38bdf8" strokeWidth={1.4} strokeDasharray="3 2">
                    <animate attributeName="stroke-dashoffset" values="0;10" dur="1s" repeatCount="indefinite" />
                  </circle>
                )}
                {selected && !tracking && (
                  <circle cx={pos.x} cy={pos.y} r={9} fill="none" stroke="#ffffff" strokeWidth={0.8} opacity={0.8} />
                )}
                {critical && (
                  <circle cx={pos.x} cy={pos.y} r={11} fill="none" stroke={STATUS_COLOR.CRITICAL} strokeWidth={1.2}>
                    <animate attributeName="r" values="8;13;8" dur="0.9s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.9;0.2;0.9" dur="0.9s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx={pos.x} cy={pos.y} r={5.5} fill={STATUS_COLOR[status]} stroke="#0a0e13" strokeWidth={1} />
                <circle cx={pos.x} cy={pos.y} r={10} fill="transparent" />
                <text x={pos.x} y={pos.y + 1.6} fontSize={4} fill="#0a0e13" textAnchor="middle" fontWeight="bold">
                  {w.worker_id.replace("W", "")}
                </text>
              </g>
            );
          })}
        </svg>

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

function nodeColor(type: string): string {
  switch (type) {
    case "shaft": return "#93c5fd";
    case "work_zone": return "#fbbf24";
    case "refuge": return "#4ade80";
    case "restricted": return "#f87171";
    default: return "#556575";
  }
}
