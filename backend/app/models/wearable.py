from __future__ import annotations
from pydantic import BaseModel


class WearableSensorState(BaseModel):
    """Continuity state for a single wearable's stochastic sensor model."""
    tag_id: str
    hr: float = 75.0
    spo2: float = 98.0
    bp_sys: float = 118.0
    bp_dia: float = 76.0
    o2_ambient: float = 20.9
    ch4_lel: float = 0.05
    battery_pct: float = 100.0
    seq: int = 0
    steps_accumulator: int = 0

    # Injected event overrides (None = no active override)
    forced_hr: float | None = None
    forced_spo2: float | None = None
    forced_bp_sys: float | None = None
    forced_bp_dia: float | None = None
    forced_o2: float | None = None
    forced_ch4: float | None = None
