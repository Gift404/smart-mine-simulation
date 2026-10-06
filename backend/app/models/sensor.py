from __future__ import annotations
from enum import Enum
from pydantic import BaseModel


class SensorType(str, Enum):
    CH4 = "CH4"
    O2 = "O2"
    AIRFLOW = "AIRFLOW"
    TEMP = "TEMP"


class SensorStatus(str, Enum):
    ONLINE = "ONLINE"
    DEGRADED = "DEGRADED"
    OFFLINE = "OFFLINE"
    FAULT = "FAULT"


class MineSensor(BaseModel):
    sensor_id: str
    name: str
    sensor_type: SensorType
    x: float
    y: float = 0.0  # elevation
    z: float = 0.0
    zone_id: str
    level_id: str | None = None
    unit: str
    linked_gateway_id: str | None = None
    status: SensorStatus = SensorStatus.ONLINE
    value: float | None = None
    last_reading_ts: float = 0.0
    battery_pct: float = 100.0
    maintenance_due_days: int = 90
