from app.simulator.simulation_engine import SimulationEngine
from app.models.alert import AlertSeverity
from app.models.worker import WearableMode


def make_engine():
    events = []
    engine = SimulationEngine(publish=lambda topic, payload: events.append((topic, payload)))
    engine.start()
    return engine, events


def test_fall_freezes_movement_and_raises_critical_alert():
    engine, events = make_engine()
    worker = engine.worker_sim.workers["W04"]
    pos_before = (worker.x, worker.y)

    engine.trigger_scenario("fall", "W04")

    alerts = [a for a in engine.alert_engine.all_alerts.values() if a.worker_id == "W04"]
    assert len(alerts) == 1
    assert alerts[0].type == "FALL_DETECTED"
    assert alerts[0].severity == AlertSeverity.CRITICAL
    assert worker.mode == WearableMode.BURST

    for _ in range(50):
        engine.tick(1.0)

    # A fallen worker must not have moved
    assert (worker.x, worker.y) == pos_before


def test_clear_resumes_movement_and_resolves_fall_alert():
    engine, events = make_engine()
    worker = engine.worker_sim.workers["W04"]
    engine.trigger_scenario("fall", "W04")
    pos_frozen = (worker.x, worker.y)

    engine.trigger_scenario("clear", "W04")
    assert worker.incapacitated is False

    for _ in range(50):
        engine.tick(1.0)

    assert (worker.x, worker.y) != pos_frozen  # movement resumed
    assert not engine.alert_engine.is_worker_in_alarm("W04")


def test_resolved_alert_is_published_to_dashboards():
    engine, events = make_engine()
    engine.trigger_scenario("fall", "W04")
    events.clear()
    engine.trigger_scenario("clear", "W04")

    resolved = [p for t, p in events if "/alert" in t and p.get("type") == "FALL_DETECTED"]
    assert resolved and resolved[-1]["status"] == "RESOLVED"


def test_panic_button_raises_critical_but_does_not_freeze_movement():
    engine, events = make_engine()
    worker = engine.worker_sim.workers["W09"]
    engine.trigger_scenario("panic", "W09")

    alerts = [a for a in engine.alert_engine.all_alerts.values() if a.worker_id == "W09"]
    assert alerts[0].type == "PANIC_BUTTON"
    assert alerts[0].severity == AlertSeverity.CRITICAL

    pos_before = (worker.x, worker.y)
    for _ in range(50):
        engine.tick(1.0)
    assert (worker.x, worker.y) != pos_before  # still mobile


def test_zone_gas_affects_all_workers_in_zone():
    engine, _ = make_engine()
    edges = list(engine.mine.edges.values())
    gas_zone = edges[0].zone_id
    in_zone = next(e.id for e in edges if e.zone_id == gas_zone)
    elsewhere = next(e.id for e in edges if e.zone_id != gas_zone)
    # Pin two workers into the gassed zone and one outside it
    for wid in ("W01", "W02"):
        engine.worker_sim.workers[wid].current_edge_id = in_zone
    engine.worker_sim.workers["W03"].current_edge_id = elsewhere

    affected = engine.trigger_zone_gas(gas_zone, value=40.0)
    assert "W01" in affected and "W02" in affected
    assert "W03" not in affected

    assert engine.wearable_sim.get_state(engine.worker_sim.workers["W01"].wearable_id).forced_ch4 == 40.0
    assert engine.wearable_sim.get_state(engine.worker_sim.workers["W03"].wearable_id).forced_ch4 is None


def test_zone_gas_unknown_zone_raises():
    engine, _ = make_engine()
    try:
        engine.trigger_zone_gas("NO_SUCH_ZONE")
        assert False, "expected ValueError"
    except ValueError as e:
        assert "unknown zone" in str(e)


def test_backhaul_failure_updates_gateway_and_publishes():
    engine, events = make_engine()
    gw_id = sorted(engine.gateway_sim.gateways)[0]
    gw = engine.set_backhaul_failure(gw_id, True)
    assert gw["backhaul_primary"] == "OFFLINE"
    assert gw["backhaul_fallback"] == "ONLINE"
    assert gw["status"] == "ONLINE"

    gateway_msgs = [p for t, p in events if f"/gateway/{gw_id}/status" in t and "gateway" in p]
    assert len(gateway_msgs) >= 1
    assert gateway_msgs[-1]["gateway"]["backhaul_primary"] == "OFFLINE"

    restored = engine.set_backhaul_failure(gw_id, False)
    assert restored["backhaul_primary"] == "ONLINE"

