from __future__ import annotations
from enum import Enum
from pydantic import BaseModel


class AlertSeverity(str, Enum):
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class AlertStatus(str, Enum):
    ACTIVE = "ACTIVE"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    RESOLVED = "RESOLVED"


class Alert(BaseModel):
    alert_id: str
    worker_id: str
    type: str
    severity: AlertSeverity
    value: float | None = None
    threshold: float | None = None
    location_edge_id: str | None = None
    location_zone_id: str | None = None
    description: str
    status: AlertStatus = AlertStatus.ACTIVE
    created_sim_ts: float
    acknowledged_sim_ts: float | None = None
    resolved_sim_ts: float | None = None
