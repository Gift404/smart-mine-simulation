"""
Scenario engine: applies deliberate overrides onto WearableSensorState
so the alert engine has something real to detect. This is what the
simulation control panel's "Trigger ..." buttons call into.
"""
from __future__ import annotations
from app.simulator.wearable import WearableSimulator
from app.models.worker import HealthState
from app.logging_config import get_logger

log = get_logger("WEARABLE")


class ScenarioEngine:
    def __init__(self, wearable_sim: WearableSimulator, workers: dict, mine=None):
        self.wearable_sim = wearable_sim
        self.workers = workers
        self.mine = mine

    def trigger_low_spo2(self, worker_id: str, value: float = 82.0) -> None:
        tag_id = self.workers[worker_id].wearable_id
        self.wearable_sim.get_state(tag_id).forced_spo2 = value
        log.info("forced low SpO2=%.1f on %s (%s)", value, worker_id, tag_id)

    def trigger_high_hr(self, worker_id: str, value: float = 150.0) -> None:
        tag_id = self.workers[worker_id].wearable_id
        self.wearable_sim.get_state(tag_id).forced_hr = value
        log.info("forced high HR=%.0f on %s (%s)", value, worker_id, tag_id)

    def trigger_low_o2(self, worker_id: str, value: float = 17.5) -> None:
        tag_id = self.workers[worker_id].wearable_id
        self.wearable_sim.get_state(tag_id).forced_o2 = value
        log.info("forced low O2=%.1f on %s (%s)", value, worker_id, tag_id)

    def trigger_methane(self, worker_id: str, value: float = 30.0) -> None:
        tag_id = self.workers[worker_id].wearable_id
        self.wearable_sim.get_state(tag_id).forced_ch4 = value
        log.info("forced methane=%.1f LEL on %s (%s)", value, worker_id, tag_id)

    def trigger_zone_gas(self, zone_id: str, value: float = 30.0) -> list[str]:
        """Raise methane on every worker currently standing in zone_id."""
        if self.mine is None:
            raise RuntimeError("ScenarioEngine has no mine reference for zone lookup")
        affected: list[str] = []
        for worker_id, worker in self.workers.items():
            edge = self.mine.edges.get(worker.current_edge_id)
            if edge is None or edge.zone_id != zone_id:
                continue
            self.wearable_sim.get_state(worker.wearable_id).forced_ch4 = value
            affected.append(worker_id)
        log.info("zone gas event zone=%s value=%.1f LEL affected=%s", zone_id, value, affected)
        return affected

    def trigger_fall(self, worker_id: str) -> None:
        w = self.workers[worker_id]
        w.health_state = HealthState.CRITICAL
        w.incapacitated = True
        tag_id = w.wearable_id
        self.wearable_sim.get_state(tag_id).forced_hr = 130.0
        log.info("fall triggered on %s (%s)", worker_id, tag_id)

    def trigger_panic(self, worker_id: str) -> None:
        w = self.workers[worker_id]
        w.health_state = HealthState.CRITICAL
        # Panic button does not imply incapacitation -- worker may still be mobile
        log.info("panic button on %s", worker_id)

    def clear(self, worker_id: str) -> None:
        w = self.workers[worker_id]
        w.health_state = HealthState.NORMAL
        w.incapacitated = False
        s = self.wearable_sim.get_state(w.wearable_id)
        s.forced_hr = s.forced_spo2 = s.forced_o2 = s.forced_ch4 = None
        s.forced_bp_sys = s.forced_bp_dia = None
        log.info("cleared forced sensors on %s", worker_id)

    def clear_zone(self, zone_id: str) -> list[str]:
        """Clear methane overrides for every worker currently in zone_id."""
        if self.mine is None:
            raise RuntimeError("ScenarioEngine has no mine reference for zone lookup")
        cleared: list[str] = []
        for worker_id, worker in self.workers.items():
            edge = self.mine.edges.get(worker.current_edge_id)
            if edge is None or edge.zone_id != zone_id:
                continue
            self.clear(worker_id)
            cleared.append(worker_id)
        return cleared
