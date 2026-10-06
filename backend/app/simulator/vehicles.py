"""
Haulage vehicles (LHDs / ore trailers) on the mine graph.

Cycle: travel empty → load at mining face → haul to dump (lift / tip) → dump → repeat.
Optional driver workers ride with the vehicle (position synced by SimulationEngine).
"""
from __future__ import annotations
import json
import random
from collections import deque
from pathlib import Path

from app.models.vehicle import Vehicle, VehicleKind, HaulPhase
from app.simulator.mine import MineGraph
from app.logging_config import get_logger

log = get_logger("SIMULATOR")

VEHICLE_EDGE_KINDS = {"tunnel", "ramp"}
LOAD_DWELL_S = (18.0, 32.0)
DUMP_DWELL_S = (12.0, 22.0)


class VehicleSimulator:
    def __init__(self, mine: MineGraph, vehicles_config_path: str | Path, seed: int | None = 99):
        self.mine = mine
        self.rng = random.Random(seed)
        self.vehicles: dict[str, Vehicle] = {}
        self._route: dict[str, list[tuple[str, int]]] = {}  # remaining (edge, dir) hops
        self._dwell_until: dict[str, float] = {}
        self._load_nodes = [n.id for n in mine.nodes.values() if n.type == "work_zone"]
        self._dump_nodes = [
            n.id for n in mine.nodes.values() if n.type in ("lift_station", "workshop")
        ]
        self._load_prefs: dict[str, list[str]] = {}
        self._dump_prefs: dict[str, list[str]] = {}

        cfg = json.loads(Path(vehicles_config_path).read_text(encoding="utf-8"))
        for vcfg in cfg.get("vehicles", []):
            edge_id = vcfg["start_edge"]
            if edge_id not in mine.edges:
                log.warning("vehicle %s start_edge %s missing — skipping", vcfg.get("vehicle_id"), edge_id)
                continue
            edge = mine.edges[edge_id]
            dist = self.rng.uniform(0.1 * edge.length, 0.9 * edge.length)
            x, y, z = mine.point_on_edge(edge_id, dist)
            kind = VehicleKind(vcfg.get("kind", "ore_trailer"))
            vid = vcfg["vehicle_id"]
            v = Vehicle(
                vehicle_id=vid,
                name=vcfg.get("name", vid),
                kind=kind,
                driver_worker_id=vcfg.get("driver_worker_id"),
                current_edge_id=edge_id,
                distance_along_edge_m=dist,
                direction=1,
                x=x, y=y, z=z,
                level=mine.level_at_edge(edge_id) or mine.level_for_depth(y),
                speed_mps=float(vcfg.get("speed_mps", 2.5)),
                phase=HaulPhase.TRAVEL_TO_LOAD,
                cargo_fill=0.0,
            )
            v.heading_deg = mine.heading_on_edge(edge_id, v.direction)
            load_ids = [n for n in vcfg.get("load_node_ids", []) if n in mine.nodes] or list(self._load_nodes)
            dump_ids = [n for n in vcfg.get("dump_node_ids", []) if n in mine.nodes] or list(self._dump_nodes)
            self.vehicles[vid] = v
            self._route[vid] = []
            self._dwell_until[vid] = 0.0
            self._load_prefs[vid] = load_ids
            self._dump_prefs[vid] = dump_ids
            self._assign_next_load(v)

        log.info("vehicles initialized count=%d", len(self.vehicles))

    def step(self, dt_s: float, sim_time_s: float) -> None:
        for v in self.vehicles.values():
            until = self._dwell_until.get(v.vehicle_id, 0.0)
            if sim_time_s < until:
                span = max(0.5, until - sim_time_s + dt_s)
                if v.phase == HaulPhase.LOADING:
                    v.cargo_fill = min(1.0, v.cargo_fill + dt_s / max(span, LOAD_DWELL_S[0]))
                elif v.phase == HaulPhase.DUMPING:
                    v.cargo_fill = max(0.0, v.cargo_fill - dt_s / max(span, DUMP_DWELL_S[0]))
                continue

            if v.phase == HaulPhase.LOADING:
                v.cargo_fill = 1.0
                self._assign_next_dump(v)
            elif v.phase == HaulPhase.DUMPING:
                v.cargo_fill = 0.0
                v.load_cycles += 1
                self._assign_next_load(v)

            if v.phase in (HaulPhase.TRAVEL_TO_LOAD, HaulPhase.TRAVEL_TO_DUMP):
                self._advance(v, dt_s, sim_time_s)

    def _assign_next_load(self, v: Vehicle) -> None:
        targets = self._load_prefs.get(v.vehicle_id, self._load_nodes)
        self.rng.shuffle(targets)
        for target in targets:
            if self._begin_trip(v, target, HaulPhase.TRAVEL_TO_LOAD):
                return
        v.phase = HaulPhase.IDLE

    def _assign_next_dump(self, v: Vehicle) -> None:
        targets = self._dump_prefs.get(v.vehicle_id, self._dump_nodes)
        self.rng.shuffle(targets)
        for target in targets:
            if self._begin_trip(v, target, HaulPhase.TRAVEL_TO_DUMP):
                return
        v.phase = HaulPhase.IDLE

    def _begin_trip(self, v: Vehicle, target_node: str, phase: HaulPhase) -> bool:
        path = self._path_from_vehicle(v, target_node)
        if not path:
            return False
        first_eid, first_dir = path[0]
        v.current_edge_id = first_eid
        v.direction = first_dir
        edge = self.mine.edges[first_eid]
        # If we are already on this edge, keep distance; else start at entry end
        if first_eid != v.current_edge_id:
            v.distance_along_edge_m = 0.0 if first_dir == 1 else edge.length
        else:
            # ensure direction matches remaining travel toward target end
            if first_dir == 1 and v.distance_along_edge_m >= edge.length - 0.01:
                v.distance_along_edge_m = max(0.0, edge.length - 0.5)
            if first_dir == -1 and v.distance_along_edge_m <= 0.01:
                v.distance_along_edge_m = min(edge.length, 0.5)
        v.phase = phase
        v.target_node_id = target_node
        self._route[v.vehicle_id] = path
        return True

    def _advance(self, v: Vehicle, dt_s: float, sim_time_s: float) -> None:
        remaining = v.speed_mps * dt_s
        route = self._route.get(v.vehicle_id, [])

        while remaining > 0:
            if not route:
                # Should have arrived — snap to target if close
                if v.target_node_id:
                    self._arrive(v, sim_time_s)
                break

            edge_id, direction = route[0]
            if v.current_edge_id != edge_id or v.direction != direction:
                v.current_edge_id = edge_id
                v.direction = direction
                edge = self.mine.edges[edge_id]
                # Enter from the start of this hop
                v.distance_along_edge_m = 0.0 if direction == 1 else edge.length

            edge = self.mine.edges[v.current_edge_id]
            if v.direction == 1:
                space = edge.length - v.distance_along_edge_m
            else:
                space = v.distance_along_edge_m

            if remaining >= space - 1e-9:
                remaining -= max(0.0, space)
                v.distance_along_edge_m = edge.length if v.direction == 1 else 0.0
                arrived_node = edge.end if v.direction == 1 else edge.start
                route.pop(0)
                self._route[v.vehicle_id] = route
                if arrived_node == v.target_node_id or not route:
                    self._arrive(v, sim_time_s)
                    remaining = 0
                    break
            else:
                v.distance_along_edge_m += v.direction * remaining
                remaining = 0

        v.x, v.y, v.z = self.mine.point_on_edge(v.current_edge_id, v.distance_along_edge_m)
        v.level = self.mine.level_at_edge(v.current_edge_id) or self.mine.level_for_depth(v.y)
        v.heading_deg = self.mine.heading_on_edge(v.current_edge_id, v.direction)

    def _arrive(self, v: Vehicle, sim_time_s: float) -> None:
        self._route[v.vehicle_id] = []
        if v.phase == HaulPhase.TRAVEL_TO_LOAD:
            v.phase = HaulPhase.LOADING
            v.cargo_fill = 0.05
            self._dwell_until[v.vehicle_id] = sim_time_s + self.rng.uniform(*LOAD_DWELL_S)
        elif v.phase == HaulPhase.TRAVEL_TO_DUMP:
            v.phase = HaulPhase.DUMPING
            self._dwell_until[v.vehicle_id] = sim_time_s + self.rng.uniform(*DUMP_DWELL_S)

    def _path_from_vehicle(self, v: Vehicle, target_node: str) -> list[tuple[str, int]] | None:
        """Shortest path as list of (edge_id, direction) hops ending at target_node."""
        edge = self.mine.edges[v.current_edge_id]
        # Two possible "current" nodes depending on travel direction
        candidates: list[tuple[str, list[tuple[str, int]]]] = []

        # Finish current edge forward
        fwd_node = edge.end if v.direction == 1 else edge.start
        candidates.append((fwd_node, [(v.current_edge_id, v.direction)]))

        # Or reverse on current edge
        rev = -v.direction
        rev_node = edge.start if v.direction == 1 else edge.end
        candidates.append((rev_node, [(v.current_edge_id, rev)]))

        best: list[tuple[str, int]] | None = None
        for start_node, prefix in candidates:
            if start_node == target_node:
                return prefix
            rest = self._bfs(start_node, target_node)
            if rest is None:
                continue
            full = prefix + rest
            if best is None or len(full) < len(best):
                best = full
        return best

    def _bfs(self, start_node: str, target_node: str) -> list[tuple[str, int]] | None:
        if start_node == target_node:
            return []
        visited = {start_node}
        q: deque[tuple[str, list[tuple[str, int]]]] = deque([(start_node, [])])
        while q:
            node, path = q.popleft()
            for eid in self.mine.edges_at_node(node):
                e = self.mine.edges[eid]
                if e.kind not in VEHICLE_EDGE_KINDS:
                    continue
                if e.start == node:
                    nxt, d = e.end, 1
                elif e.end == node:
                    nxt, d = e.start, -1
                else:
                    continue
                if nxt in visited:
                    continue
                visited.add(nxt)
                new_path = path + [(eid, d)]
                if nxt == target_node:
                    return new_path
                q.append((nxt, new_path))
        return None
