from __future__ import annotations
import itertools
from app.models.job import Job, JobStatus
from app.models.alert import Alert, AlertSeverity
from app.logging_config import get_logger

_job_ids = itertools.count(1)
log = get_logger("JOB")


class JobEngine:
    def __init__(self):
        self.jobs: dict[str, Job] = {}

    def create_from_alert(self, alert: Alert, sim_ts: float) -> Job | None:
        if alert.severity != AlertSeverity.CRITICAL:
            return None
        if any(j.alert_id == alert.alert_id for j in self.jobs.values()):
            return None  # a job already exists for this alert
        job_id = f"JOB-{next(_job_ids):04d}"
        job = Job(
            job_id=job_id,
            alert_id=alert.alert_id,
            worker_id=alert.worker_id,
            title=f"Respond to Worker {alert.worker_id}",
            location_edge_id=alert.location_edge_id,
            location_zone_id=alert.location_zone_id,
            priority="CRITICAL",
            status=JobStatus.DISPATCHED,
            created_sim_ts=sim_ts,
        )
        self.jobs[job_id] = job
        log.info("%s DISPATCHED for alert=%s worker=%s", job_id, alert.alert_id, alert.worker_id)
        return job

    def set_status(self, job_id: str, status: JobStatus) -> Job | None:
        job = self.jobs.get(job_id)
        if job:
            job.status = status
        return job
