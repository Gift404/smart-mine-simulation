from __future__ import annotations
from enum import Enum
from pydantic import BaseModel


class JobStatus(str, Enum):
    CREATED = "CREATED"
    DISPATCHED = "DISPATCHED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class Job(BaseModel):
    job_id: str
    alert_id: str
    worker_id: str
    title: str
    location_edge_id: str | None = None
    location_zone_id: str | None = None
    priority: str
    status: JobStatus = JobStatus.CREATED
    created_sim_ts: float
