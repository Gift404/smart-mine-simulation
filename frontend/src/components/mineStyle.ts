/**
 * Shared colours, facility labels and label decluttering for the 3D, plan and section maps.
 */
import type { MineEdge, MineGraph, MineNode } from "../types";

export const LEVEL_COLORS: Record<string, string> = {
  SURFACE: "#94a3b8",
  L750: "#7dd3fc",
  L850: "#6ee7b7",
  L950: "#fcd34d",
  L996: "#fdba74",
  L1050: "#f9a8d4",
  L1090: "#f9a8d4",
};

export const SHAFT_COLORS: Record<string, string> = {
  S1_SHAFT: "#6b8cae",
  S2_SHAFT: "#38bdf8",
  S3_SHAFT: "#eab308",
  S4_SHAFT: "#6b9e7a",
  S5_SHAFT: "#6b9e7a",
  MAIN_SHAFT: "#6b8cae",
  VENT_SHAFT: "#6b9e7a",
  ESCAPE_SHAFT: "#b07a7a",
  ACCESS_RAMP: "#a78bfa",
  PROD_RAMP: "#c084fc",
  ORE_PASS: "#b45309",
  DECLINE_RAMP: "#b8956e",
};

export function levelColor(levelId: string | null | undefined): string {
  return (levelId && LEVEL_COLORS[levelId]) || "#94a3b8";
}

/** Facility styling; `priority` decides which label survives when labels collide (higher wins). */
export const NODE_STYLE: Record<string, { color: string; label: string; priority: number }> = {
  refuge: { color: "#4ade80", label: "Refuge chamber", priority: 90 },
  restricted: { color: "#fb7185", label: "Explosives magazine", priority: 85 },
  emergency: { color: "#f87171", label: "Pump / services", priority: 70 },
  lift_station: { color: "#facc15", label: "Shaft station", priority: 60 },
  surface: { color: "#94a3b8", label: "Shaft collar", priority: 58 },
  work_zone: { color: "#fbbf24", label: "Stope face", priority: 55 },
  workshop: { color: "#fb923c", label: "Workshop", priority: 50 },
  crusher: { color: "#a8a29e", label: "Crusher", priority: 46 },
  silo: { color: "#d97706", label: "Ore silo", priority: 45 },
  tip: { color: "#d97706", label: "Truck tip", priority: 45 },
  ore_pass: { color: "#b45309", label: "Ore pass", priority: 35 },
  vent_station: { color: "#86efac", label: "Ventilation", priority: 30 },
  conveyor: { color: "#78716c", label: "Conveyor", priority: 25 },
};

export function nodeColor(type: string): string {
  return NODE_STYLE[type]?.color ?? "#556575";
}

export function isFacility(n: MineNode): boolean {
  return n.type in NODE_STYLE;
}

/** Shafts, raises and ore passes — anything that isn't a level drive or truck ramp. */
export function isVerticalEdge(e: MineEdge): boolean {
  return !!e.kind && e.kind !== "tunnel" && e.kind !== "ramp";
}

export function edgeColor(e: MineEdge, nodeById: Record<string, MineNode>): string {
  if (e.kind && e.kind !== "tunnel") return SHAFT_COLORS[e.zone_id] ?? (e.kind === "ramp" ? "#a78bfa" : "#94a3b8");
  return levelColor(e.level_id ?? nodeById[e.start]?.level_id);
}

/** Legend entries for the facility types and route kinds that actually appear in this mine. */
export function mineLegend(mine: MineGraph): { color: string; label: string; shape: "dot" | "line" | "dash" }[] {
  const types = new Set(mine.nodes.map((n) => n.type));
  const out: { color: string; label: string; shape: "dot" | "line" | "dash" }[] = [];
  const seen = new Set<string>();
  for (const [type, s] of Object.entries(NODE_STYLE)) {
    if (!types.has(type) || seen.has(s.label)) continue;
    seen.add(s.label);
    out.push({ color: s.color, label: s.label, shape: "dot" });
  }
  const kinds = new Set(mine.edges.map((e) => e.kind ?? "tunnel"));
  const routes: [string, string, string, "line" | "dash"][] = [
    ["shaft", "#6b8cae", "Shaft", "line"],
    ["vent_shaft", "#6b9e7a", "Vent raise", "dash"],
    ["ore_pass", "#b45309", "Ore pass route", "dash"],
    ["ramp", "#b8956e", "Truck ramp", "line"],
  ];
  for (const [kind, color, label, shape] of routes) {
    if (kinds.has(kind) && !seen.has(label)) {
      seen.add(label);
      out.push({ color, label, shape });
    }
  }
  return out;
}

export interface LabelBox {
  id: string;
  /** Anchor in screen pixels; the box extends right/up from the anchor by default */
  x: number;
  y: number;
  w: number;
  h: number;
  priority: number;
}

/** Greedy placement: highest priority first, drop any label that overlaps one already placed. */
export function declutter(labels: LabelBox[], pad = 2): Set<string> {
  const placed: LabelBox[] = [];
  const keep = new Set<string>();
  for (const l of [...labels].sort((a, b) => b.priority - a.priority)) {
    const hit = placed.some(
      (p) => l.x < p.x + p.w + pad && l.x + l.w + pad > p.x && l.y < p.y + p.h + pad && l.y + l.h + pad > p.y,
    );
    if (hit) continue;
    placed.push(l);
    keep.add(l.id);
  }
  return keep;
}

/** Rough text width for 11px UI font, good enough for collision tests. */
export function textWidth(text: string, fontPx = 11): number {
  return text.length * fontPx * 0.58 + 6;
}
