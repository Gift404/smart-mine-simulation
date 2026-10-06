from app.simulator.mine import MineGraph
from app.simulator.workers import WorkerSimulator
from app.config import MINE_CONFIG, WORKERS_CONFIG


def test_workers_load_on_3d_graph():
    mine = MineGraph(MINE_CONFIG)
    sim = WorkerSimulator(mine, WORKERS_CONFIG)
    assert len(sim.workers) == 15
    for w in sim.workers.values():
        assert w.current_edge_id in mine.edges
        assert w.z is not None
        assert w.level


def test_workers_stay_on_graph_after_steps():
    mine = MineGraph(MINE_CONFIG)
    sim = WorkerSimulator(mine, WORKERS_CONFIG)
    for _ in range(50):
        sim.step(0.2, 10.0)
    for w in sim.workers.values():
        expected_x, expected_y, expected_z = mine.point_on_edge(w.current_edge_id, w.distance_along_edge_m)
        assert abs(w.x - expected_x) < 1e-6
        assert abs(w.y - expected_y) < 1e-6
        assert abs(w.z - expected_z) < 1e-6


def test_shaft_riders_can_change_depth():
    mine = MineGraph(MINE_CONFIG)
    sim = WorkerSimulator(mine, WORKERS_CONFIG, seed=7)
    riders = [w for w in sim.workers.values() if w.behavior_profile == "shaft_rider"]
    assert riders
    start_depths = {w.worker_id: w.y for w in riders}
    for t in range(800):
        sim.step(0.25, t * 0.25)
    # At least one rider should have changed elevation meaningfully
    moved = any(abs(sim.workers[wid].y - d0) > 20 for wid, d0 in start_depths.items())
    assert moved
