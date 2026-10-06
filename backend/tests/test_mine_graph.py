from app.simulator.mine import MineGraph
from app.config import MINE_CONFIG


def load():
    return MineGraph(MINE_CONFIG)


def test_loads_platreef_multilevel():
    mine = load()
    assert "Platreef" in mine.name
    depths = {lv.id: lv.depth_m for lv in mine.levels}
    assert depths["SURFACE"] == 0.0
    assert depths["L750"] == -750.0
    assert depths["L850"] == -850.0
    assert depths["L950"] == -950.0
    assert depths["L1050"] == -1050.0
    assert "L750_S1" in mine.nodes
    assert "L950_CRUSHER" in mine.nodes
    assert "L750_TIP1" in mine.nodes
    assert mine.nodes["L750_S1"].y == -750.0
    # Shaft complex present
    assert any(e.zone_id == "S1_SHAFT" for e in mine.edges.values())
    assert any(e.zone_id == "S3_SHAFT" for e in mine.edges.values())
    assert any(e.kind == "ramp" for e in mine.edges.values())
    assert any(e.kind == "ore_pass" for e in mine.edges.values())


def test_shaft1_connects_surface_to_750():
    mine = load()
    eid = "S1_SURFACE_S1_to_L750"
    assert eid in mine.edges
    x0, y0, z0 = mine.point_on_edge(eid, 0)
    x1, y1, z1 = mine.point_on_edge(eid, mine.edges[eid].length)
    assert y0 == 0.0
    assert y1 == -750.0


def test_snap_point_3d():
    mine = load()
    result = mine.snap_point(5, -750, 5)
    assert result["edge_id"] in mine.edges
    assert "snapped_z" in result
