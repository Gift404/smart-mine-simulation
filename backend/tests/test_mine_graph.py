from app.simulator.mine import MineGraph
from app.config import MINE_CONFIG


def load():
    return MineGraph(MINE_CONFIG)


def test_loads_blueprint_multilevel():
    mine = load()
    assert mine.name == "Smart Mine 3D"
    depths = {lv.id: lv.depth_m for lv in mine.levels}
    assert depths["SURFACE"] == 0.0
    assert depths["L1"] == -100.0
    assert depths["L2"] == -250.0
    assert depths["L3"] == -400.0
    assert depths["L4"] == -550.0
    assert "L1_LIFT" in mine.nodes
    assert "L4_LIFT" in mine.nodes
    assert mine.nodes["L1_LIFT"].y == -100.0
    assert abs(mine.nodes["L1_LIFT"].y - mine.nodes["L2_LIFT"].y) == 150.0
    # Three shaft systems
    assert any(e.zone_id == "MAIN_SHAFT" for e in mine.edges.values())
    assert any(e.zone_id == "VENT_SHAFT" for e in mine.edges.values())
    assert any(e.zone_id == "ESCAPE_SHAFT" for e in mine.edges.values())
    # Unique footprints — L1 has loop nodes, L4 has stem
    assert "L1_LOOP_E" in mine.nodes
    assert "L4_N2" in mine.nodes


def test_main_shaft_connects_surface_to_l1():
    mine = load()
    eid = "MAIN_SURFACE_MAIN_to_L1"
    assert eid in mine.edges
    x0, y0, z0 = mine.point_on_edge(eid, 0)
    x1, y1, z1 = mine.point_on_edge(eid, mine.edges[eid].length)
    assert y0 == 0.0
    assert y1 == -100.0


def test_snap_point_3d():
    mine = load()
    result = mine.snap_point(5, -100, 5)
    assert result["edge_id"] in mine.edges
    assert "snapped_z" in result
