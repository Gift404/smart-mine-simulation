import json
from collections import deque

import pytest
from fastapi.testclient import TestClient

from app.config import SIMULATIONS
from app.simulator.simulation_engine import SimulationEngine


def make_engine(sim_id: str) -> SimulationEngine:
    return SimulationEngine(publish=lambda topic, payload: None, simulation=SIMULATIONS[sim_id])


@pytest.mark.parametrize("sim_id", list(SIMULATIONS))
def test_mine_graph_is_connected(sim_id):
    mine = make_engine(sim_id).mine
    start = next(iter(mine.nodes))
    seen, q = {start}, deque([start])
    while q:
        node = q.popleft()
        for eid in mine.edges_at_node(node):
            e = mine.edges[eid]
            other = e.end if e.start == node else e.start
            if other not in seen:
                seen.add(other)
                q.append(other)
    assert seen == set(mine.nodes)


@pytest.mark.parametrize("sim_id", list(SIMULATIONS))
def test_config_references_resolve(sim_id):
    engine = make_engine(sim_id)
    mine = engine.mine
    zones = set(engine.list_zones())

    for rule in engine.geofence_engine.rules:
        assert set(rule.node_ids) <= set(mine.nodes), rule.fence_id
        assert set(rule.zone_ids) <= zones, rule.fence_id
    for s in engine.sensor_sim.sensors.values():
        assert s.linked_gateway_id in engine.gateway_sim.gateways, s.sensor_id

    cfg = json.loads(SIMULATIONS[sim_id].vehicles.read_text(encoding="utf-8"))
    assert len(engine.vehicle_sim.vehicles) == len(cfg["vehicles"])
    for vcfg in cfg["vehicles"]:
        assert vcfg["driver_worker_id"] in (None, *engine.worker_sim.workers)


def test_schematic_vehicles_can_reach_every_load_and_dump_point():
    engine = make_engine("platreef_schematic")
    vs = engine.vehicle_sim
    for vid, v in vs.vehicles.items():
        start = vs.mine.edges[v.current_edge_id].start
        for target in vs._load_prefs[vid] + vs._dump_prefs[vid]:
            assert start == target or vs._bfs(start, target) is not None, (vid, target)


def test_schematic_reuses_primary_roster_and_fleet():
    primary = make_engine("platreef")
    schematic = make_engine("platreef_schematic")
    for wid, w in primary.worker_sim.workers.items():
        s = schematic.worker_sim.workers[wid]
        assert (s.name, s.role, s.behavior_profile, s.walking_speed_mps) == (
            w.name, w.role, w.behavior_profile, w.walking_speed_mps,
        )
    assert set(schematic.vehicle_sim.vehicles) == set(primary.vehicle_sim.vehicles)
    assert schematic.thresholds == primary.thresholds


def test_schematic_runs_and_haul_cycles_complete():
    engine = make_engine("platreef_schematic")
    engine.start()
    for _ in range(600):
        engine.tick(0.2)
    assert sum(v.load_cycles for v in engine.vehicle_sim.vehicles.values()) > 0
    for w in engine.worker_sim.workers.values():
        assert w.current_edge_id in engine.mine.edges


def test_api_switches_simulation_and_back():
    import app.main as main

    client = TestClient(main.app)
    sims = {s["id"]: s for s in client.get("/api/simulations").json()}
    assert set(sims) == set(SIMULATIONS)
    original = next(s for s in sims.values() if s["active"])["id"]
    other = next(sid for sid in sims if sid != original)
    try:
        assert client.post(f"/api/simulations/{other}/activate").json()["simulation_id"] == other
        mine = client.get("/api/mine").json()
        assert mine["simulation_id"] == other
        assert client.get("/api/simulation/status").json()["simulation_id"] == other
        assert "error" in client.post("/api/simulations/nope/activate").json()
    finally:
        client.post(f"/api/simulations/{original}/activate")
    assert client.get("/api/mine").json()["simulation_id"] == original
