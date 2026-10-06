from app.simulator.simulation_engine import SimulationEngine


def test_continuous_track_publishes_between_radio_fixes():
    events = []
    engine = SimulationEngine(publish=lambda topic, payload: events.append((topic, payload)))
    engine.start()

    for _ in range(300):
        engine.tick(0.2)

    position_events = [p for t, p in events if t.startswith("mine/section3/wearable/") and t.endswith("/position")]
    methods = {p["method"] for p in position_events}

    assert "RSSI_MULTILATERATION" in methods
    assert "CONTINUOUS_TRACK" in methods
    track_count = sum(1 for p in position_events if p["method"] == "CONTINUOUS_TRACK")
    radio_count = sum(1 for p in position_events if p["method"] == "RSSI_MULTILATERATION")
    assert track_count > radio_count


def test_track_stays_on_tunnel_and_does_not_teleport():
    """Markers follow continuous sim path — consecutive fused points stay local."""
    events = []
    engine = SimulationEngine(publish=lambda topic, payload: events.append((topic, payload)))
    engine.start()

    for _ in range(200):
        engine.tick(0.2)

    by_tag: dict[str, list] = {}
    for topic, payload in events:
        if topic.endswith("/position") and payload.get("method") == "CONTINUOUS_TRACK":
            by_tag.setdefault(payload["tag_id"], []).append(payload)

    for tag_id, pts in by_tag.items():
        if len(pts) < 2:
            continue
        for a, b in zip(pts, pts[1:]):
            jump = ((b["fused_x"] - a["fused_x"]) ** 2 + (b["fused_y"] - a["fused_y"]) ** 2) ** 0.5
            assert jump < 4.0, f"{tag_id} jumped {jump:.1f}m between track updates"
