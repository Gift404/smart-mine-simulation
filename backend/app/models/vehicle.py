from __future__ import annotations
from enum import Enum
from pydantic import BaseModel, computed_field


class VehicleKind(str, Enum):
    LHD = "lhd"
    ORE_TRAILER = "ore_trailer"


class HaulPhase(str, Enum):
    TRAVEL_TO_LOAD = "TRAVEL_TO_LOAD"
    LOADING = "LOADING"
    TRAVEL_TO_DUMP = "TRAVEL_TO_DUMP"
    DUMPING = "DUMPING"
    IDLE = "IDLE"


class Vehicle(BaseModel):
    vehicle_id: str
    name: str
    kind: VehicleKind
    driver_worker_id: str | None = None
    driver_name: str | None = None

    current_edge_id: str
    distance_along_edge_m: float = 0.0
    direction: int = 1

    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    level: str = "UNKNOWN"
    heading_deg: float = 0.0

    speed_mps: float = 2.5
    phase: HaulPhase = HaulPhase.TRAVEL_TO_LOAD
    cargo_fill: float = 0.0  # 0 empty → 1 full
    target_node_id: str | None = None
    load_cycles: int = 0

    @computed_field
    @property
    def depth_m(self) -> float:
        return self.y

    @computed_field
    @property
    def activity(self) -> str:
        return {
            HaulPhase.TRAVEL_TO_LOAD: "Empty haul to face",
            HaulPhase.LOADING: "Loading ore",
            HaulPhase.TRAVEL_TO_DUMP: "Hauling ore",
            HaulPhase.DUMPING: "Tipping ore",
            HaulPhase.IDLE: "Standby",
        }.get(self.phase, self.phase.value)
