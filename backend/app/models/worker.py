from __future__ import annotations
from enum import Enum
from pydantic import BaseModel, computed_field


class HealthState(str, Enum):
    NORMAL = "NORMAL"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"
    LOST = "LOST"


class WearableMode(str, Enum):
    NORMAL = "normal"
    BURST = "burst"


class Worker(BaseModel):
    worker_id: str
    name: str
    role: str
    wearable_id: str

    current_edge_id: str
    distance_along_edge_m: float = 0.0
    direction: int = 1  # 1 = start->end, -1 = end->start

    # 3D mine coordinates: X east, Y elevation, Z north
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    level: str = "UNKNOWN"
    nearest_gateway: str | None = None
    heading_deg: float = 0.0

    walking_speed_mps: float = 1.2
    behavior_profile: str = "steady"

    health_state: HealthState = HealthState.NORMAL
    mode: WearableMode = WearableMode.NORMAL

    last_transmission_sim_ts: float = 0.0
    paused_until_sim_ts: float = 0.0
    incapacitated: bool = False

    # Operational activity for control-room display (sphere icon unchanged)
    activity: str = "Transit"
    activity_detail: str | None = None
    assigned_vehicle_id: str | None = None

    @computed_field
    @property
    def depth_m(self) -> float:
        return self.y

    @computed_field
    @property
    def current_tunnel(self) -> str:
        return self.current_edge_id
