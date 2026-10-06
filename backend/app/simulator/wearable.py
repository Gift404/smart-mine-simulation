"""
Wearable sensor simulation.

Sensor values evolve with bounded random-walk noise so that consecutive
readings are correlated (temporal continuity), rather than being redrawn
independently each cycle. Deliberate "events" (see scenarios.py) can pin
a sensor toward an abnormal target value; the random walk then continues
around that target until the event is cleared.
"""
from __future__ import annotations
import random

from app.models.wearable import WearableSensorState
from app.models.telemetry import Telemetry


def _walk(value: float, target: float, max_step: float, rng: random.Random,
          lo: float, hi: float) -> float:
    """Move `value` a small random step toward `target`, clamped to [lo, hi]."""
    pull = (target - value) * 0.15
    noise = rng.uniform(-max_step, max_step)
    return max(lo, min(hi, value + pull + noise))


class WearableSimulator:
    def __init__(self, rng: random.Random | None = None):
        self.rng = rng or random.Random(11)
        self.states: dict[str, WearableSensorState] = {}

    def get_state(self, tag_id: str) -> WearableSensorState:
        if tag_id not in self.states:
            self.states[tag_id] = WearableSensorState(tag_id=tag_id)
        return self.states[tag_id]

    def generate(self, tag_id: str, sim_ts: float, mode: str,
                 steps_since_last: int, heading_deg: float) -> Telemetry:
        s = self.get_state(tag_id)

        hr_target = s.forced_hr if s.forced_hr is not None else 78.0
        spo2_target = s.forced_spo2 if s.forced_spo2 is not None else 98.0
        bp_sys_target = s.forced_bp_sys if s.forced_bp_sys is not None else (118.0 + (hr_target - 78.0) * 0.35)
        bp_dia_target = s.forced_bp_dia if s.forced_bp_dia is not None else (76.0 + (hr_target - 78.0) * 0.15)
        o2_target = s.forced_o2 if s.forced_o2 is not None else 20.9
        ch4_target = s.forced_ch4 if s.forced_ch4 is not None else 0.05

        s.hr = _walk(s.hr, hr_target, 2.0, self.rng, 40, 190)
        s.spo2 = _walk(s.spo2, spo2_target, 0.6, self.rng, 60, 100)
        s.bp_sys = _walk(s.bp_sys, bp_sys_target, 1.8, self.rng, 85, 190)
        s.bp_dia = _walk(s.bp_dia, bp_dia_target, 1.2, self.rng, 50, 120)
        s.o2_ambient = _walk(s.o2_ambient, o2_target, 0.08, self.rng, 15.0, 21.0)
        s.ch4_lel = max(0.0, _walk(s.ch4_lel, ch4_target, 0.3, self.rng, 0.0, 100.0))
        s.battery_pct = max(0.0, s.battery_pct - (0.01 if mode == "normal" else 0.03))
        s.seq += 1

        return Telemetry(
            tag_id=tag_id,
            seq=s.seq,
            ts=sim_ts,
            hr=round(s.hr),
            spo2=round(s.spo2),
            bp_sys=round(s.bp_sys),
            bp_dia=round(s.bp_dia),
            o2_ambient=round(s.o2_ambient, 2),
            ch4_lel=round(s.ch4_lel, 2),
            imu_steps_since_last=steps_since_last,
            imu_heading_deg=round(heading_deg, 1),
            battery_pct=round(s.battery_pct, 1),
            mode=mode,
            device_status="OK" if s.battery_pct > 5 else "LOW_BATTERY",
        )
