from __future__ import annotations
from pydantic import BaseModel, computed_field


class PositionEstimate(BaseModel):
    tag_id: str
    ts: float
    raw_x: float
    raw_y: float  # elevation
    raw_z: float = 0.0
    snapped_x: float
    snapped_y: float
    snapped_z: float = 0.0
    edge_id: str | None = None
    zone_id: str | None = None
    level: str | None = None
    fused_x: float
    fused_y: float
    fused_z: float = 0.0
    confidence: float
    confidence_label: str
    gateways_used: list[str]
    method: str = "RSSI_MULTILATERATION"
    nearest_gateway: str | None = None

    @computed_field
    @property
    def depth_m(self) -> float:
        return self.fused_y
