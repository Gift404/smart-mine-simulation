from app.alerts.engine import AlertEngine
from app.alerts.thresholds import Thresholds
from app.jobs.engine import JobEngine
from app.models.telemetry import Telemetry
from app.models.alert import AlertSeverity, AlertStatus
from app.config import THRESHOLDS_CONFIG


def make_telemetry(**overrides):
    base = dict(tag_id="WD-W07", seq=1, ts=0, hr=78, spo2=98, bp_sys=118, bp_dia=76,
                o2_ambient=20.9, ch4_lel=0.05, imu_steps_since_last=10, imu_heading_deg=90,
                battery_pct=90, mode="normal")
    base.update(overrides)
    return Telemetry(**base)


def test_low_spo2_triggers_critical_alert_and_job():
    thresholds = Thresholds.load(THRESHOLDS_CONFIG)
    alert_engine = AlertEngine(thresholds)
    job_engine = JobEngine()

    telemetry = make_telemetry(spo2=82)
    alerts = alert_engine.evaluate(telemetry, "W07", "E01", "TUNNEL_MAIN", sim_ts=10)

    assert len(alerts) == 1
    alert = alerts[0]
    assert alert.type == "LOW_SPO2"
    assert alert.severity == AlertSeverity.CRITICAL
    assert alert.status == AlertStatus.ACTIVE

    job = job_engine.create_from_alert(alert, sim_ts=10)
    assert job is not None
    assert job.worker_id == "W07"
    assert job.priority == "CRITICAL"


def test_warning_does_not_create_job():
    thresholds = Thresholds.load(THRESHOLDS_CONFIG)
    alert_engine = AlertEngine(thresholds)
    job_engine = JobEngine()

    telemetry = make_telemetry(spo2=93)  # below warning(94), above critical(90)
    alerts = alert_engine.evaluate(telemetry, "W03", "E01", "TUNNEL_MAIN", sim_ts=10)
    assert len(alerts) == 1
    assert alerts[0].severity == AlertSeverity.WARNING
    assert job_engine.create_from_alert(alerts[0], sim_ts=10) is None


def test_alert_auto_resolves_when_condition_clears():
    thresholds = Thresholds.load(THRESHOLDS_CONFIG)
    alert_engine = AlertEngine(thresholds)

    alert_engine.evaluate(make_telemetry(spo2=82), "W07", "E01", "TUNNEL_MAIN", sim_ts=10)
    assert alert_engine.is_worker_in_alarm("W07")

    alert_engine.evaluate(make_telemetry(spo2=98), "W07", "E01", "TUNNEL_MAIN", sim_ts=20)
    assert not alert_engine.is_worker_in_alarm("W07")


def test_acknowledge_alert():
    thresholds = Thresholds.load(THRESHOLDS_CONFIG)
    alert_engine = AlertEngine(thresholds)
    alerts = alert_engine.evaluate(make_telemetry(spo2=82), "W07", "E01", "TUNNEL_MAIN", sim_ts=10)
    acked = alert_engine.acknowledge(alerts[0].alert_id, sim_ts=15)
    assert acked.status == AlertStatus.ACKNOWLEDGED
    assert acked.acknowledged_sim_ts == 15
