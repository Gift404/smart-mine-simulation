from __future__ import annotations
from pydantic import BaseModel


class Telemetry(BaseModel):
    tag_id: str
    seq: int
    ts: float
    hr: int
    spo2: int
    bp_sys: int
    bp_dia: int
    o2_ambient: float
    ch4_lel: float
    imu_steps_since_last: int
    imu_heading_deg: float
    battery_pct: float
    mode: str
    device_status: str = "OK"
