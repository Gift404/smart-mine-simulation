from __future__ import annotations
from enum import Enum
from pydantic import BaseModel, computed_field


class BackhaulStatus(str, Enum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"


class Gateway(BaseModel):
    gateway_id: str
    x: float
    y: float = 0.0  # elevation
    z: float = 0.0  # northing
    zone_id: str
    level_id: str | None = None
    name: str | None = None
    status: str = "ONLINE"
    backhaul_primary: BackhaulStatus = BackhaulStatus.ONLINE
    backhaul_fallback: BackhaulStatus = BackhaulStatus.ONLINE

    @computed_field
    @property
    def depth_m(self) -> float:
        return self.y


class RssiObservation(BaseModel):
    tag_id: str
    gateway_id: str
    rssi: float
    ts: float
