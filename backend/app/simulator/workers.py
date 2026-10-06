"""
Worker movement on the 3D tunnel graph.

Horizontal drifts stay on-level; shaft_rider workers prefer vertical shaft /
vent / escape / ramp edges so they travel between levels.

Role-aware work: drillers/blasters dwell at mining faces; mechanics at workshops;
supervisors briefly inspect; miners stay as colored spheres — activity is text only.
"""
from __future__ import annotations
import json
import math
import random
from pathlib import Path

from app.models.worker import Worker, HealthState, WearableMode
from app.simulator.mine import MineGraph
from app.logging_config import get_logger

log = get_logger("SIMULATOR")

SPEED_SCALE = 1.15
STAY_ON_CORRIDOR = 0.92
SHAFT_KINDS = {"shaft", "vent_shaft", "escape_shaft", "service_shaft", "ramp"}

# Roles that perform face work in mining areas (work_zone nodes)
FACE_WORK_ROLES = {
    "Blaster": ("Charging / blast prep", (25.0, 55.0), 0.78),
    "Driller": ("Drilling face", (30.0, 70.0), 0.82),
    "Geologist": ("Sampling face", (20.0, 40.0), 0.55),
    "Surveyor": ("Surveying drive", (18.0, 35.0), 0.50),
    "Supervisor": ("Inspecting face", (12.0, 28.0), 0.40),
    "Loader Operator": ("Spotting loader", (8.0, 16.0), 0.15),  # usually driving; short face visits
}
WORKSHOP_ROLES = {
    "Mechanic": ("Servicing equipment", (35.0, 75.0), 0.85),
    "Electrician": ("Electrical maintenance", (30.0, 60.0), 0.80),
}
REFUGE_CHANCE = 0.08
REFUGE_DWELL = (15.0, 45.0)


class WorkerSimulator:
    def __init__(self, mine: MineGraph, workers_config_path: str | Path, seed: int | None = 42):
        self.mine = mine
        self.rng = random.Random(seed)
        self.work_zone_ids = {n.id for n in mine.nodes.values() if n.type == "work_zone"}
        self.workshop_ids = {n.id for n in mine.nodes.values() if n.type == "workshop"}
        self.refuge_ids = {n.id for n in mine.nodes.values() if n.type == "refuge"}
        # node_id -> edge ids that touch it (for biasing routes)
        self._node_edges = {
            nid: list(mine.edges_at_node(nid)) for nid in mine.nodes
        }
        cfg = json.loads(Path(workers_config_path).read_text(encoding="utf-8"))
        self.workers: dict[str, Worker] = {}
        for wcfg in cfg["workers"]:
            edge_id = wcfg["start_edge"]
            edge = mine.edges[edge_id]
            dist = self.rng.uniform(0, edge.length)
            x, y, z = mine.point_on_edge(edge_id, dist)
            w = Worker(
                worker_id=wcfg["worker_id"],
                name=wcfg["name"],
                role=wcfg["role"],
                wearable_id=wcfg["wearable_id"],
                current_edge_id=edge_id,
                distance_along_edge_m=dist,
                direction=self.rng.choice([1, -1]),
                x=x, y=y, z=z,
                level=mine.level_at_edge(edge_id) or mine.level_for_depth(y),
                walking_speed_mps=wcfg["walking_speed_mps"] * SPEED_SCALE,
                behavior_profile=wcfg["behavior_profile"],
                activity="Transit",
            )
            w.heading_deg = mine.heading_on_edge(edge_id, w.direction)
            w.last_transmission_sim_ts = -1e9
            self.workers[w.worker_id] = w

    def step(self, dt_s: float, sim_time_s: float) -> None:
        for w in self.workers.values():
            if w.assigned_vehicle_id:
                # Position owned by vehicle sim — keep activity as driving
                continue
            if self._is_incapacitated(w):
                w.activity = "Down — emergency"
                continue
            if sim_time_s < w.paused_until_sim_ts:
                # Still working in place
                continue
            if w.activity not in ("Transit", "Driving"):
                w.activity = "Transit"
                w.activity_detail = None
            self._advance_worker(w, dt_s, sim_time_s)

    def visible_count(self) -> int:
        return len(self.workers)

    def _is_incapacitated(self, w: Worker) -> bool:
        return w.health_state == HealthState.CRITICAL and w.incapacitated

    def _advance_worker(self, w: Worker, dt_s: float, sim_time_s: float) -> None:
        edge = self.mine.edges[w.current_edge_id]
        remaining = w.walking_speed_mps * dt_s

        while remaining > 0:
            if w.direction == 1:
                space_left = edge.length - w.distance_along_edge_m
            else:
                space_left = w.distance_along_edge_m

            if remaining < space_left:
                w.distance_along_edge_m += w.direction * remaining
                remaining = 0
            else:
                remaining -= space_left
                w.distance_along_edge_m = edge.length if w.direction == 1 else 0.0
                node_id = edge.end if w.direction == 1 else edge.start
                self._handle_junction(w, node_id, sim_time_s)
                edge = self.mine.edges[w.current_edge_id]
                if sim_time_s < w.paused_until_sim_ts:
                    remaining = 0

        w.x, w.y, w.z = self.mine.point_on_edge(w.current_edge_id, w.distance_along_edge_m)
        w.level = self.mine.level_at_edge(w.current_edge_id) or self.mine.level_for_depth(w.y)
        w.heading_deg = self.mine.heading_on_edge(w.current_edge_id, w.direction)

    def _try_start_work(self, w: Worker, node_id: str, sim_time_s: float) -> bool:
        node = self.mine.nodes.get(node_id)
        if not node:
            return False

        if node.type == "work_zone" and w.role in FACE_WORK_ROLES:
            label, dwell, chance = FACE_WORK_ROLES[w.role]
            if self.rng.random() < chance:
                w.activity = label
                w.activity_detail = node_id
                w.paused_until_sim_ts = sim_time_s + self.rng.uniform(*dwell)
                return True

        if node.type == "workshop" and w.role in WORKSHOP_ROLES:
            label, dwell, chance = WORKSHOP_ROLES[w.role]
            if self.rng.random() < chance:
                w.activity = label
                w.activity_detail = node_id
                w.paused_until_sim_ts = sim_time_s + self.rng.uniform(*dwell)
                return True

        if node.type == "refuge" and self.rng.random() < REFUGE_CHANCE:
            w.activity = "Refuge rest"
            w.activity_detail = node_id
            w.paused_until_sim_ts = sim_time_s + self.rng.uniform(*REFUGE_DWELL)
            return True

        return False

    def _prefer_work_edges(self, w: Worker, candidates: list[str], node_id: str) -> list[str]:
        """Bias toward edges that lead into preferred facility nodes for this role."""
        prefer_types: set[str] = set()
        if w.role in FACE_WORK_ROLES:
            prefer_types.add("work_zone")
        if w.role in WORKSHOP_ROLES:
            prefer_types.add("workshop")
        if not prefer_types:
            return candidates

        preferred = []
        for eid in candidates:
            e = self.mine.edges[eid]
            other = e.end if e.start == node_id else e.start
            n = self.mine.nodes.get(other)
            if n and n.type in prefer_types:
                preferred.append(eid)
        return preferred if preferred else candidates

    def _handle_junction(self, w: Worker, node_id: str, sim_time_s: float) -> None:
        current = self.mine.edges[w.current_edge_id]
        candidates = [eid for eid in self.mine.edges_at_node(node_id) if eid != w.current_edge_id]
        is_portal = node_id in self.mine.portal_node_ids

        if self._try_start_work(w, node_id, sim_time_s):
            # Stay at junction — reverse so next step re-enters or waits
            w.direction *= -1
            return

        if is_portal or not candidates:
            w.direction *= -1
            return

        if w.behavior_profile == "pausing" and self.rng.random() < 0.12:
            w.paused_until_sim_ts = sim_time_s + self.rng.uniform(2, 8)
            w.activity = "Paused"

        vertical = [eid for eid in candidates if self.mine.edges[eid].kind in SHAFT_KINDS]
        straight = [
            eid for eid in candidates
            if self.mine.edges[eid].zone_id == current.zone_id
        ]
        work_biased = self._prefer_work_edges(w, candidates, node_id)

        # Elevator / shaft riders prefer vertical connectors between levels
        if w.behavior_profile == "shaft_rider" and vertical and self.rng.random() < 0.72:
            next_edge_id = self.rng.choice(vertical)
        elif work_biased is not candidates and self.rng.random() < 0.55:
            next_edge_id = self.rng.choice(work_biased)
        elif straight and (w.behavior_profile != "turnaround") and (
            self.rng.random() < STAY_ON_CORRIDOR or not candidates
        ):
            next_edge_id = straight[0] if len(straight) == 1 else self.rng.choice(straight)
        elif w.behavior_profile == "turnaround":
            w.direction *= -1
            return
        else:
            # Occasional level change even for normal workers at lift stations
            if vertical and self.rng.random() < 0.08:
                next_edge_id = self.rng.choice(vertical)
            else:
                next_edge_id = self.rng.choice(candidates)

        e = self.mine.edges[next_edge_id]
        w.current_edge_id = next_edge_id
        w.direction = 1 if e.start == node_id else -1
        w.distance_along_edge_m = 0.0 if w.direction == 1 else e.length


def nearest_gateway_id(x: float, y: float, z: float, gateways: dict) -> str | None:
    best_id = None
    best_d = 1e18
    for gid, g in gateways.items():
        if getattr(g, "status", "ONLINE") != "ONLINE":
            continue
        d = (x - g.x) ** 2 + (y - g.y) ** 2 + (z - g.z) ** 2
        if d < best_d:
            best_d = d
            best_id = gid
    return best_id
