"""Generate expanded (~5x wing) mine layout + gateways + worker starts."""
import json
from pathlib import Path

root = Path(__file__).resolve().parent

VX = [0, 140]
HY = [40, 100, 160]
SEG = 80
WING = 240 * 5  # 1200m each direction from core

y_north = list(range(HY[0] - SEG, HY[0] - WING - 1, -SEG))
if y_north[-1] != HY[0] - WING:
    y_north.append(HY[0] - WING)

y_south = list(range(HY[2] + SEG, HY[2] + WING + 1, SEG))
if y_south[-1] != HY[2] + WING:
    y_south.append(HY[2] + WING)

x_west = list(range(VX[0] - SEG, VX[0] - WING - 1, -SEG))
if x_west[-1] != VX[0] - WING:
    x_west.append(VX[0] - WING)

x_east = list(range(VX[1] + SEG, VX[1] + WING + 1, SEG))
if x_east[-1] != VX[1] + WING:
    x_east.append(VX[1] + WING)

nodes: dict = {}
edges: list = []
gateways: list = []


def add_node(nid, x, y, typ="intersection"):
    nodes[nid] = {"id": nid, "x": x, "y": y, "type": typ}


def add_edge(eid, a, b, zone, length=None):
    na, nb = nodes[a], nodes[b]
    if length is None:
        length = abs(na["x"] - nb["x"]) + abs(na["y"] - nb["y"])
    edges.append({
        "id": eid,
        "start": a,
        "end": b,
        "length": float(length),
        "direction": "both",
        "speed_limit": 1.4,
        "zone_id": zone,
    })


for vi, x in enumerate(VX, 1):
    for hi, y in enumerate(HY, 1):
        add_node(f"V{vi}_H{hi}", x, y, "intersection")

for vi, x in enumerate(VX, 1):
    zone = "VERT_WEST" if vi == 1 else "VERT_EAST"
    prev = f"V{vi}_H1"
    for i, y in enumerate(y_north):
        nid = f"V{vi}_N{i + 1}"
        typ = "shaft" if i == len(y_north) - 1 else "intersection"
        add_node(nid, x, y, typ)
        add_edge(f"EV{vi}_N{i + 1}", prev, nid, zone)
        prev = nid

for vi, _x in enumerate(VX, 1):
    zone = "VERT_WEST" if vi == 1 else "VERT_EAST"
    add_edge(f"EV{vi}_H12", f"V{vi}_H1", f"V{vi}_H2", zone, 60)
    add_edge(f"EV{vi}_H23", f"V{vi}_H2", f"V{vi}_H3", zone, 60)

for vi, x in enumerate(VX, 1):
    zone = "VERT_WEST" if vi == 1 else "VERT_EAST"
    prev = f"V{vi}_H3"
    for i, y in enumerate(y_south):
        nid = f"V{vi}_S{i + 1}"
        typ = "shaft" if i == len(y_south) - 1 else "intersection"
        add_node(nid, x, y, typ)
        add_edge(f"EV{vi}_S{i + 1}", prev, nid, zone)
        prev = nid

for hi, y in enumerate(HY, 1):
    zone = ["HORIZ_NORTH", "HORIZ_MID", "HORIZ_SOUTH"][hi - 1]
    end_type = "work_zone" if hi != 3 else "refuge"
    prev = f"V1_H{hi}"
    for i, x in enumerate(x_west):
        nid = f"H{hi}_W{i + 1}"
        typ = end_type if i == len(x_west) - 1 else "intersection"
        add_node(nid, x, y, typ)
        add_edge(f"EH{hi}_W{i + 1}", prev, nid, zone)
        prev = nid

for hi, _y in enumerate(HY, 1):
    zone = ["HORIZ_NORTH", "HORIZ_MID", "HORIZ_SOUTH"][hi - 1]
    add_edge(f"EH{hi}_M", f"V1_H{hi}", f"V2_H{hi}", zone, 140)

for hi, y in enumerate(HY, 1):
    zone = ["HORIZ_NORTH", "HORIZ_MID", "HORIZ_SOUTH"][hi - 1]
    end_type = "work_zone" if hi != 3 else "refuge"
    prev = f"V2_H{hi}"
    for i, x in enumerate(x_east):
        nid = f"H{hi}_E{i + 1}"
        typ = end_type if i == len(x_east) - 1 else "intersection"
        add_node(nid, x, y, typ)
        add_edge(f"EH{hi}_E{i + 1}", prev, nid, zone)
        prev = nid

portals = []
for vi in (1, 2):
    portals.append({"node_id": f"V{vi}_N{len(y_north)}", "dx": 0, "dy": -80, "label": "continues north"})
    portals.append({"node_id": f"V{vi}_S{len(y_south)}", "dx": 0, "dy": 80, "label": "continues south"})
for hi in (1, 2, 3):
    portals.append({"node_id": f"H{hi}_W{len(x_west)}", "dx": -80, "dy": 0, "label": "continues west"})
    portals.append({"node_id": f"H{hi}_E{len(x_east)}", "dx": 80, "dy": 0, "label": "continues east"})

gw = 1


def add_gw(x, y, zone):
    global gw
    gateways.append({"gateway_id": f"GW{gw:02d}", "x": x, "y": y, "zone_id": zone})
    gw += 1


for vi, x in enumerate(VX, 1):
    zone = "VERT_WEST" if vi == 1 else "VERT_EAST"
    for y in HY:
        add_gw(x, y, zone)
    add_gw(x, y_north[len(y_north) // 2], zone)
    add_gw(x, y_south[len(y_south) // 2], zone)
    add_gw(x, y_north[-1], zone)
    add_gw(x, y_south[-1], zone)

for hi, y in enumerate(HY, 1):
    zone = ["HORIZ_NORTH", "HORIZ_MID", "HORIZ_SOUTH"][hi - 1]
    add_gw(x_west[len(x_west) // 2], y, zone)
    add_gw(x_west[-1], y, zone)
    add_gw((VX[0] + VX[1]) / 2, y, zone)
    add_gw(x_east[len(x_east) // 2], y, zone)
    add_gw(x_east[-1], y, zone)

mine = {
    "name": "Smart Mine",
    "nodes": list(nodes.values()),
    "edges": edges,
    "portals": portals,
    "zones": ["VERT_WEST", "VERT_EAST", "HORIZ_NORTH", "HORIZ_MID", "HORIZ_SOUTH"],
    "gateway_locations": gateways,
}

edge_ids = {e["id"] for e in edges}
workers = {
    "workers": [
        {"worker_id": "W01", "name": "Thabo", "role": "Blaster", "wearable_id": "WD-W01", "start_edge": "EV1_N1", "walking_speed_mps": 1.2, "behavior_profile": "steady"},
        {"worker_id": "W02", "name": "Sipho", "role": "Mechanic", "wearable_id": "WD-W02", "start_edge": "EV1_H12", "walking_speed_mps": 1.1, "behavior_profile": "steady"},
        {"worker_id": "W03", "name": "Lerato", "role": "Loader Operator", "wearable_id": "WD-W03", "start_edge": "EV1_S5", "walking_speed_mps": 0.95, "behavior_profile": "patrol"},
        {"worker_id": "W04", "name": "Naledi", "role": "Mechanic", "wearable_id": "WD-W04", "start_edge": "EV2_N3", "walking_speed_mps": 1.15, "behavior_profile": "steady"},
        {"worker_id": "W05", "name": "Johan", "role": "Loader Operator", "wearable_id": "WD-W05", "start_edge": "EV2_H23", "walking_speed_mps": 1.05, "behavior_profile": "steady"},
        {"worker_id": "W06", "name": "Pieter", "role": "Driller", "wearable_id": "WD-W06", "start_edge": "EV2_S8", "walking_speed_mps": 1.2, "behavior_profile": "patrol"},
        {"worker_id": "W07", "name": "Ayanda", "role": "Supervisor", "wearable_id": "WD-W07", "start_edge": "EH1_W3", "walking_speed_mps": 0.9, "behavior_profile": "steady"},
        {"worker_id": "W08", "name": "Kagiso", "role": "Blaster", "wearable_id": "WD-W08", "start_edge": "EH1_M", "walking_speed_mps": 1.1, "behavior_profile": "steady"},
        {"worker_id": "W09", "name": "Tumi", "role": "Surveyor", "wearable_id": "WD-W09", "start_edge": "EH1_E5", "walking_speed_mps": 1.0, "behavior_profile": "patrol"},
        {"worker_id": "W10", "name": "Bongani", "role": "Geologist", "wearable_id": "WD-W10", "start_edge": "EH2_W8", "walking_speed_mps": 0.95, "behavior_profile": "steady"},
        {"worker_id": "W11", "name": "Refilwe", "role": "Blaster", "wearable_id": "WD-W11", "start_edge": "EH2_M", "walking_speed_mps": 1.05, "behavior_profile": "steady"},
        {"worker_id": "W12", "name": "Mpho", "role": "Mechanic", "wearable_id": "WD-W12", "start_edge": "EH2_E10", "walking_speed_mps": 1.0, "behavior_profile": "patrol"},
        {"worker_id": "W13", "name": "Katlego", "role": "Supervisor", "wearable_id": "WD-W13", "start_edge": "EH3_W2", "walking_speed_mps": 1.15, "behavior_profile": "steady"},
        {"worker_id": "W14", "name": "Dineo", "role": "Loader Operator", "wearable_id": "WD-W14", "start_edge": "EH3_M", "walking_speed_mps": 1.0, "behavior_profile": "steady"},
        {"worker_id": "W15", "name": "Vusi", "role": "Electrician", "wearable_id": "WD-W15", "start_edge": "EH3_E12", "walking_speed_mps": 1.05, "behavior_profile": "patrol"},
    ]
}
for w in workers["workers"]:
    assert w["start_edge"] in edge_ids, w["start_edge"]

(root / "mine.json").write_text(json.dumps(mine, indent=2) + "\n", encoding="utf-8")
(root / "gateways.json").write_text(json.dumps({
    "coverage_radius_m": 120,
    "path_loss_exponent": 2.8,
    "reference_rssi_at_1m": -40,
    "noise_std_db": 4.0,
    "gateways": gateways,
}, indent=2) + "\n", encoding="utf-8")
(root / "workers.json").write_text(json.dumps(workers, indent=2) + "\n", encoding="utf-8")

xs = [n["x"] for n in nodes.values()]
ys = [n["y"] for n in nodes.values()]
print("nodes", len(nodes), "edges", len(edges), "gateways", len(gateways))
print("spanX", max(xs) - min(xs), "spanY", max(ys) - min(ys))
print("EV", sum(1 for e in edges if e["id"].startswith("EV")), "EH", sum(1 for e in edges if e["id"].startswith("EH")))
