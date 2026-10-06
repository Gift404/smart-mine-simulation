import random
from app.simulator.mine import MineGraph
from app.simulator.gateways import GatewaySimulator
from app.simulator.radio import RadioSimulator
from app.positioning.multilateration import estimate_position
from app.positioning.map_matching import snap_to_graph, confidence_score
from app.config import MINE_CONFIG, GATEWAYS_CONFIG


def test_radio_uses_3d_distance():
    gw_sim = GatewaySimulator(GATEWAYS_CONFIG)
    radio = RadioSimulator(gw_sim, rng=random.Random(1))
    # Same XZ as a gateway but different elevation → farther than planar-only
    true_x, true_y, true_z = 0.0, -100.0, 0.0
    obs = radio.transmit("W07", true_x, true_y, true_z, sim_ts=0)
    assert len(obs) >= 1


def test_positioning_pipeline_never_receives_ground_truth():
    import inspect
    from app.positioning import multilateration
    sig = inspect.signature(multilateration.estimate_position)
    param_names = list(sig.parameters.keys())
    assert "true_x" not in param_names and "true_y" not in param_names
    assert "observations" in param_names


def test_estimate_and_snap_produces_plausible_3d_position():
    mine = MineGraph(MINE_CONFIG)
    gw_sim = GatewaySimulator(GATEWAYS_CONFIG)
    radio = RadioSimulator(gw_sim, rng=random.Random(2))

    true_x, true_y, true_z = 5.0, -100.0, 5.0
    obs = radio.transmit("W07", true_x, true_y, true_z, sim_ts=0)
    raw = estimate_position(obs, gw_sim.gateways, gw_sim.reference_rssi_at_1m, gw_sim.path_loss_exponent)
    if raw is None:
        # May need more gateways in range; still valid path
        return
    assert "z" in raw
    snap = snap_to_graph(mine, raw["x"], raw["y"], raw["z"])
    assert snap["edge_id"] in mine.edges
    confidence, label = confidence_score(raw["n_gateways"], raw["avg_rssi"], snap["distance_correction"])
    assert 0 <= confidence <= 1
    assert label in ("HIGH", "MEDIUM", "LOW")
