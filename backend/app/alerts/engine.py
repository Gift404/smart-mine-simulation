from __future__ import annotations
import itertools
from app.models.alert import Alert, AlertSeverity, AlertStatus
from app.models.telemetry import Telemetry
from app.alerts.thresholds import Thresholds
from app.logging_config import get_logger

_alert_ids = itertools.count(1)
log = get_logger("ALERT")


class AlertEngine:
    def __init__(self, thresholds: Thresholds):
        self.thresholds = thresholds
        self.active_alerts: dict[str, Alert] = {}  # keyed by f"{worker_id}:{type}"
        self.all_alerts: dict[str, Alert] = {}      # keyed by alert_id
        self.last_seen_sim_ts: dict[str, float] = {}

    def evaluate(self, telemetry: Telemetry, worker_id: str, edge_id: str, zone_id: str, sim_ts: float) -> list[Alert]:
        self.last_seen_sim_ts[telemetry.tag_id] = sim_ts
        new_alerts = []
        t = self.thresholds

        new_alerts += self._check(worker_id, "LOW_SPO2", telemetry.spo2 < t.spo2_critical,
                                   telemetry.spo2 < t.spo2_warning, telemetry.spo2, t.spo2_warning,
                                   edge_id, zone_id, sim_ts, f"SpO2 low: {telemetry.spo2}%")

        new_alerts += self._check(worker_id, "HIGH_HR", telemetry.hr > t.hr_critical,
                                   telemetry.hr > t.hr_warning, telemetry.hr, t.hr_warning,
                                   edge_id, zone_id, sim_ts, f"Heart rate elevated: {telemetry.hr} bpm")

        new_alerts += self._check(worker_id, "LOW_O2", telemetry.o2_ambient < t.o2_critical,
                                   telemetry.o2_ambient < t.o2_warning, telemetry.o2_ambient, t.o2_warning,
                                   edge_id, zone_id, sim_ts, f"Ambient O2 low: {telemetry.o2_ambient}%")

        new_alerts += self._check(worker_id, "HIGH_METHANE", telemetry.ch4_lel > t.ch4_critical,
                                   telemetry.ch4_lel > t.ch4_warning, telemetry.ch4_lel, t.ch4_warning,
                                   edge_id, zone_id, sim_ts, f"Methane elevated: {telemetry.ch4_lel}% LEL")

        new_alerts += self._check(worker_id, "LOW_BATTERY", telemetry.battery_pct < t.battery_critical,
                                   telemetry.battery_pct < t.battery_warning, telemetry.battery_pct,
                                   t.battery_warning, edge_id, zone_id, sim_ts,
                                   f"Battery low: {telemetry.battery_pct}%")

        self._auto_resolve(worker_id, "LOW_SPO2", telemetry.spo2 >= t.spo2_warning, sim_ts)
        self._auto_resolve(worker_id, "HIGH_HR", telemetry.hr <= t.hr_warning, sim_ts)
        self._auto_resolve(worker_id, "LOW_O2", telemetry.o2_ambient >= t.o2_warning, sim_ts)
        self._auto_resolve(worker_id, "HIGH_METHANE", telemetry.ch4_lel <= t.ch4_warning, sim_ts)

        return new_alerts

    def raise_manual(self, worker_id: str, alert_type: str, severity: AlertSeverity,
                      edge_id: str, zone_id: str, sim_ts: float, description: str) -> Alert:
        return self._create(worker_id, alert_type, severity, None, None, edge_id, zone_id, sim_ts, description)

    def check_comm_loss(self, worker_id: str, tag_id: str, sim_ts: float, edge_id: str, zone_id: str) -> list[Alert]:
        last = self.last_seen_sim_ts.get(tag_id)
        if last is not None and (sim_ts - last) > self.thresholds.comm_loss_timeout_s:
            key = f"{worker_id}:COMM_LOSS"
            if key not in self.active_alerts:
                return [self._create(worker_id, "COMM_LOSS", AlertSeverity.WARNING, None, None,
                                      edge_id, zone_id, sim_ts, "Lost wearable communication")]
        return []

    def acknowledge(self, alert_id: str, sim_ts: float) -> Alert | None:
        alert = self.all_alerts.get(alert_id)
        if alert and alert.status == AlertStatus.ACTIVE:
            alert.status = AlertStatus.ACKNOWLEDGED
            alert.acknowledged_sim_ts = sim_ts
        return alert

    def is_worker_in_alarm(self, worker_id: str) -> bool:
        return any(a.worker_id == worker_id and a.status != AlertStatus.RESOLVED
                   for a in self.active_alerts.values())

    def worst_severity(self, worker_id: str) -> AlertSeverity | None:
        sevs = [a.severity for a in self.active_alerts.values()
                if a.worker_id == worker_id and a.status != AlertStatus.RESOLVED]
        if AlertSeverity.CRITICAL in sevs:
            return AlertSeverity.CRITICAL
        if AlertSeverity.WARNING in sevs:
            return AlertSeverity.WARNING
        return None

    # -- internals --

    def _check(self, worker_id, alert_type, is_critical, is_warning, value, threshold,
               edge_id, zone_id, sim_ts, description) -> list[Alert]:
        key = f"{worker_id}:{alert_type}"
        if is_critical or is_warning:
            severity = AlertSeverity.CRITICAL if is_critical else AlertSeverity.WARNING
            existing = self.active_alerts.get(key)
            if existing and existing.status != AlertStatus.RESOLVED:
                if existing.severity != severity:
                    escalated = severity == AlertSeverity.CRITICAL
                    existing.severity = severity
                    if escalated:
                        return [existing]  # re-surface so a response job gets created
                return []
            return [self._create(worker_id, alert_type, severity, value, threshold,
                                  edge_id, zone_id, sim_ts, description)]
        return []

    def _create(self, worker_id, alert_type, severity, value, threshold,
                edge_id, zone_id, sim_ts, description) -> Alert:
        alert_id = f"EVT-{next(_alert_ids):04d}"
        alert = Alert(
            alert_id=alert_id, worker_id=worker_id, type=alert_type, severity=severity,
            value=value, threshold=threshold, location_edge_id=edge_id, location_zone_id=zone_id,
            description=description, created_sim_ts=sim_ts,
        )
        key = f"{worker_id}:{alert_type}"
        self.active_alerts[key] = alert
        self.all_alerts[alert_id] = alert
        log.info("%s %s worker=%s zone=%s — %s", alert_id, severity.value, worker_id, zone_id, description)
        return alert

    def _auto_resolve(self, worker_id: str, alert_type: str, cleared: bool, sim_ts: float) -> None:
        key = f"{worker_id}:{alert_type}"
        alert = self.active_alerts.get(key)
        if alert and cleared and alert.status != AlertStatus.RESOLVED:
            alert.status = AlertStatus.RESOLVED
            alert.resolved_sim_ts = sim_ts
            del self.active_alerts[key]
            log.info("%s RESOLVED worker=%s type=%s", alert.alert_id, worker_id, alert_type)
