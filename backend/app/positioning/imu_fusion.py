"""
Fuses the last radio-derived (snapped) position with simulated IMU
dead-reckoning so the displayed position moves smoothly between
RSSI fixes instead of jumping.
"""
from __future__ import annotations
from app.simulator.mine import MineGraph


class ImuFusionTracker:
    def __init__(self, mine: MineGraph):
        self.mine = mine
        # tag_id -> (edge_id, distance_along, direction)
        self._dead_reckoned: dict[str, tuple[str, float, int]] = {}

    def has_fix(self, tag_id: str) -> bool:
        return tag_id in self._dead_reckoned

    def on_radio_fix(self, tag_id: str, edge_id: str, distance_along: float, direction: int) -> None:
        self._dead_reckoned[tag_id] = (edge_id, distance_along, direction)

    def advance(self, tag_id: str, distance_m: float) -> tuple[float, float, float, str] | None:
        """Move along tracked edge; return (x, y_elev, z, edge_id)."""
        if tag_id not in self._dead_reckoned or distance_m <= 0:
            return None

        edge_id, dist, direction = self._dead_reckoned[tag_id]
        edge = self.mine.edges[edge_id]
        dist += direction * distance_m
        dist = max(0.0, min(edge.length, dist))
        self._dead_reckoned[tag_id] = (edge_id, dist, direction)
        x, y, z = self.mine.point_on_edge(edge_id, dist)
        return x, y, z, edge_id
