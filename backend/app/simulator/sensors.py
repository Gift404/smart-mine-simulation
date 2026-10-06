"""Fixed mine environmental sensors (not wearables)."""
from __future__ import annotations
import json
import random
from pathlib import Path

from app.models.sensor import MineSensor, SensorStatus, SensorType
from app.logging_config import get_logger

log = get_logger("SENSORS")

# Nominal ambient baselines when no workers are nearby
_BASELINE = {
    SensorType.CH4: 0.4,
    SensorType.O2: 20.8,
    SensorType.AIRFLOW: 1.6,
    SensorType.TEMP: 24.0,
}


class SensorSimulator:
    def __init__(self, config_path: str | Path, rng: random.Random | None = None):
        cfg = json.loads(Path(config_path).read_text(encoding="utf-8"))
        self.sensors: dict[str, MineSensor] = {
            s["sensor_id"]: MineSensor(**s) for s in cfg["sensors"]
        }
        self._rng = rng or random.Random(42)
        self._last_pub_ts = -1e9
        self._forced_offline: set[str] = set()
        self._forced_fault: set[str] = set()
        log.info("loaded %d fixed mine sensors", len(self.sensors))

    def set_offline(self, sensor_id: str, offline: bool) -> MineSensor:
        s = self.sensors[sensor_id]
        if offline:
            self._forced_offline.add(sensor_id)
            self._forced_fault.discard(sensor_id)
            s.status = SensorStatus.OFFLINE
            s.value = None
        else:
            self._forced_offline.discard(sensor_id)
            s.status = SensorStatus.ONLINE
        return s

    def set_fault(self, sensor_id: str, fault: bool) -> MineSensor:
        s = self.sensors[sensor_id]
        if fault:
            self._forced_fault.add(sensor_id)
            self._forced_offline.discard(sensor_id)
            s.status = SensorStatus.FAULT
        else:
            self._forced_fault.discard(sensor_id)
            s.status = SensorStatus.ONLINE
        return s

    def update(
        self,
        sim_ts: float,
        zone_gas: dict[str, dict[str, float]],
        gateway_online: dict[str, bool],
    ) -> list[MineSensor]:
        """Refresh readings ~every 2 sim-seconds. Returns sensors that changed enough to publish."""
        if sim_ts - self._last_pub_ts < 2.0:
            return []
        self._last_pub_ts = sim_ts
        changed: list[MineSensor] = []

        for s in self.sensors.values():
            if s.sensor_id in self._forced_offline:
                if s.status != SensorStatus.OFFLINE or s.value is not None:
                    s.status = SensorStatus.OFFLINE
                    s.value = None
                    s.last_reading_ts = sim_ts
                    changed.append(s)
                continue
            if s.sensor_id in self._forced_fault:
                if s.status != SensorStatus.FAULT:
                    s.status = SensorStatus.FAULT
                    s.last_reading_ts = sim_ts
                    changed.append(s)
                # still produce noisy/stuck value
                if s.value is None:
                    s.value = _BASELINE[s.sensor_type]
                continue

            linked_ok = True
            if s.linked_gateway_id:
                linked_ok = gateway_online.get(s.linked_gateway_id, True)

            ambient = zone_gas.get(s.zone_id, {})
            base = _BASELINE[s.sensor_type]
            if s.sensor_type == SensorType.CH4:
                val = ambient.get("ch4", base) + self._rng.gauss(0, 0.08)
                val = max(0.0, val)
            elif s.sensor_type == SensorType.O2:
                val = ambient.get("o2", base) + self._rng.gauss(0, 0.05)
                val = min(21.0, max(16.0, val))
            elif s.sensor_type == SensorType.AIRFLOW:
                val = base + self._rng.gauss(0, 0.12)
                if not linked_ok:
                    val *= 0.55
                val = max(0.1, val)
            else:
                val = base + self._rng.gauss(0, 0.3)

            status = SensorStatus.ONLINE if linked_ok else SensorStatus.DEGRADED
            # Battery slowly drains; low battery → degraded
            s.battery_pct = max(5.0, s.battery_pct - 0.002)
            if s.battery_pct < 20:
                status = SensorStatus.DEGRADED

            s.value = round(val, 2)
            s.status = status
            s.last_reading_ts = sim_ts
            changed.append(s)

        return changed

    def online_count(self) -> int:
        return sum(1 for s in self.sensors.values() if s.status == SensorStatus.ONLINE)
