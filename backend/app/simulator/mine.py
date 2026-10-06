"""
Mine tunnel graph (3D).

Coordinate system (metres):
  X = East / West
  Y = Elevation (0 = surface, negative = underground depth)
  Z = North / South

Workers exist only on this graph as (edge_id, distance_along_edge).
Cartesian (x, y, z) is derived for radio, positioning, and display.
"""
from __future__ import annotations
import json
import math
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Node:
    id: str
    x: float
    y: float  # elevation
    z: float  # northing
    type: str
    level_id: str | None = None
    depth_m: float | None = None


@dataclass
class Edge:
    id: str
    start: str
    end: str
    length: float
    direction: str
    speed_limit: float
    zone_id: str
    level_id: str | None = None
    kind: str = "tunnel"


@dataclass
class Portal:
    node_id: str
    dx: float = 0.0
    dy: float = 0.0
    dz: float = 0.0
    label: str = ""


@dataclass
class LevelInfo:
    id: str
    name: str
    depth_m: float
    label: str


class MineGraph:
    def __init__(self, config_path: str | Path):
        data = json.loads(Path(config_path).read_text(encoding="utf-8"))
        self.name = data["name"]
        self.coordinate_system = data.get("coordinate_system", {})
        self.levels: list[LevelInfo] = [
            LevelInfo(
                id=lv["id"],
                name=lv["name"],
                depth_m=float(lv["depth_m"]),
                label=lv.get("label", lv["name"]),
            )
            for lv in data.get("levels", [])
        ]
        self.nodes: dict[str, Node] = {}
        for n in data["nodes"]:
            # Backward compat: old 2D configs used y as planar northing
            if "z" not in n:
                n = {**n, "z": n["y"], "y": 0.0, "depth_m": 0.0, "level_id": n.get("level_id")}
            self.nodes[n["id"]] = Node(
                id=n["id"],
                x=float(n["x"]),
                y=float(n["y"]),
                z=float(n["z"]),
                type=n.get("type", "intersection"),
                level_id=n.get("level_id"),
                depth_m=float(n["y"]) if n.get("depth_m") is None else float(n["depth_m"]),
            )
        self.edges: dict[str, Edge] = {}
        for e in data["edges"]:
            self.edges[e["id"]] = Edge(
                id=e["id"],
                start=e["start"],
                end=e["end"],
                length=float(e["length"]),
                direction=e.get("direction", "both"),
                speed_limit=float(e.get("speed_limit", 1.2)),
                zone_id=e["zone_id"],
                level_id=e.get("level_id"),
                kind=e.get("kind", "tunnel"),
            )
        self.gateway_locations = data.get("gateway_locations", [])
        self.portals: list[Portal] = [
            Portal(
                node_id=p["node_id"],
                dx=float(p.get("dx", 0)),
                dy=float(p.get("dy", 0)),
                dz=float(p.get("dz", 0)),
                label=p.get("label", ""),
            )
            for p in data.get("portals", [])
            if p.get("node_id") in self.nodes
        ]
        self.portal_node_ids: set[str] = {p.node_id for p in self.portals}

        self._adjacency: dict[str, list[str]] = {n: [] for n in self.nodes}
        for e in self.edges.values():
            self._adjacency[e.start].append(e.id)
            if e.direction == "both":
                self._adjacency[e.end].append(e.id)

    def edges_at_node(self, node_id: str) -> list[str]:
        return self._adjacency.get(node_id, [])

    def edge_endpoints(self, edge_id: str) -> tuple[Node, Node]:
        e = self.edges[edge_id]
        return self.nodes[e.start], self.nodes[e.end]

    def point_on_edge(self, edge_id: str, distance_along: float) -> tuple[float, float, float]:
        """Interpolate (x, y_elev, z) at distance_along metres from edge start."""
        e = self.edges[edge_id]
        a, b = self.nodes[e.start], self.nodes[e.end]
        t = 0.0 if e.length == 0 else max(0.0, min(1.0, distance_along / e.length))
        x = a.x + (b.x - a.x) * t
        y = a.y + (b.y - a.y) * t
        z = a.z + (b.z - a.z) * t
        return x, y, z

    def heading_on_edge(self, edge_id: str, direction: int) -> float:
        """Heading in the XZ plane: 0 = north (+Z), clockwise."""
        e = self.edges[edge_id]
        a, b = self.nodes[e.start], self.nodes[e.end]
        if direction == -1:
            a, b = b, a
        dx, dz = b.x - a.x, b.z - a.z
        if abs(dx) < 1e-9 and abs(dz) < 1e-9:
            # Vertical shaft — heading undefined; keep previous via 0
            return 0.0
        return math.degrees(math.atan2(dx, dz)) % 360

    def level_at_edge(self, edge_id: str) -> str | None:
        e = self.edges.get(edge_id)
        if not e:
            return None
        if e.level_id:
            return e.level_id
        # Vertical connectors: infer from midpoint elevation
        a, b = self.edge_endpoints(edge_id)
        mid_y = 0.5 * (a.y + b.y)
        return self.level_for_depth(mid_y)

    def level_for_depth(self, depth_m: float) -> str:
        if not self.levels:
            return "UNKNOWN"
        best = min(self.levels, key=lambda lv: abs(lv.depth_m - depth_m))
        return best.id

    def snap_point(self, x: float, y: float, z: float) -> dict:
        """Map-match: closest point on any edge in 3D."""
        best = None
        for e in self.edges.values():
            a, b = self.nodes[e.start], self.nodes[e.end]
            px, py, pz, t = self._closest_point_on_segment_3d(
                x, y, z, a.x, a.y, a.z, b.x, b.y, b.z,
            )
            dist = math.sqrt((x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2)
            if best is None or dist < best["distance_correction"]:
                best = {
                    "edge_id": e.id,
                    "zone_id": e.zone_id,
                    "level_id": e.level_id or self.level_for_depth(py),
                    "snapped_x": px,
                    "snapped_y": py,
                    "snapped_z": pz,
                    "distance_along_edge": t * e.length,
                    "distance_correction": dist,
                }
        return best

    @staticmethod
    def _closest_point_on_segment_3d(px, py, pz, ax, ay, az, bx, by, bz):
        abx, aby, abz = bx - ax, by - ay, bz - az
        denom = abx * abx + aby * aby + abz * abz
        if denom == 0:
            return ax, ay, az, 0.0
        t = ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / denom
        t = max(0.0, min(1.0, t))
        return ax + abx * t, ay + aby * t, az + abz * t, t
