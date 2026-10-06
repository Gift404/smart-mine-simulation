from __future__ import annotations
import json
from pathlib import Path
from dataclasses import dataclass


@dataclass
class Thresholds:
    spo2_warning: float
    spo2_critical: float
    hr_warning: float
    hr_critical: float
    o2_warning: float
    o2_critical: float
    ch4_warning: float
    ch4_critical: float
    battery_warning: float
    battery_critical: float
    comm_loss_timeout_s: float
    normal_interval_s: float
    burst_interval_s: float

    @classmethod
    def load(cls, path: str | Path) -> "Thresholds":
        cfg = json.loads(Path(path).read_text())
        return cls(
            spo2_warning=cfg["spo2"]["warning_below"],
            spo2_critical=cfg["spo2"]["critical_below"],
            hr_warning=cfg["heart_rate"]["warning_above"],
            hr_critical=cfg["heart_rate"]["critical_above"],
            o2_warning=cfg["ambient_o2_pct"]["warning_below"],
            o2_critical=cfg["ambient_o2_pct"]["critical_below"],
            ch4_warning=cfg["methane_lel_pct"]["warning_above"],
            ch4_critical=cfg["methane_lel_pct"]["critical_above"],
            battery_warning=cfg["battery_pct"]["warning_below"],
            battery_critical=cfg["battery_pct"]["critical_below"],
            comm_loss_timeout_s=cfg["comm_loss_timeout_s"],
            normal_interval_s=cfg["burst_mode"]["normal_interval_s"],
            burst_interval_s=cfg["burst_mode"]["burst_interval_s"],
        )
