"""
Generate multi-level 3D mine matching the ChatGPT blueprint image.

Blueprint concepts:
  - Surface @ 0 m, Level 1..4 at -100 / -250 / -400 / -550 m
  - Main shaft (blue), Ventilation shaft (green), Emergency shaft (red)
  - Each level has its OWN horizontal tunnel footprint (loops/branches)
  - Lift stations, refuge, workshop, emergency zones, LoRa gateways

Coords: X=east, Y=elevation (negative underground), Z=north
"""
from __future__ import annotations

import json
from pathlib import Path

root = Path(__file__).resolve().parent

LEVELS = [
    {"id": "L1", "name": "Level 1", "depth_m": -100.0, "label": "Level 1 (-100m)"},
    {"id": "L2", "name": "Level 2", "depth_m": -250.0, "label": "Level 2 (-250m)"},
    {"id": "L3", "name": "Level 3", "depth_m": -400.0, "label": "Level 3 (-400m)"},
    {"id": "L4", "name": "Level 4", "depth_m": -550.0, "label": "Level 4 (-550m)"},
]

SURFACE_Y = 0.0

# Fixed shaft columns (XZ) — consistent through all depths like the blueprint
MAIN_XZ = (0.0, 0.0)
VENT_XZ = (55.0, 45.0)
ESCAPE_XZ = (-70.0, -55.0)

nodes: dict[str, dict] = {}
edges: list[dict] = []
gateways: list[dict] = []


def add_node(nid, x, y, z, typ, level_id):
    nodes[nid] = {
        "id": nid, "x": float(x), "y": float(y), "z": float(z),
        "type": typ, "level_id": level_id, "depth_m": float(y),
    }


def dist3(a, b):
    na, nb = nodes[a], nodes[b]
    return ((nb["x"] - na["x"]) ** 2 + (nb["y"] - na["y"]) ** 2 + (nb["z"] - na["z"]) ** 2) ** 0.5


def add_edge(eid, a, b, zone, level_id, kind="tunnel"):
    edges.append({
        "id": eid, "start": a, "end": b,
        "length": round(dist3(a, b), 2),
        "direction": "both",
        "speed_limit": 0.85 if kind != "tunnel" else 1.2,
        "zone_id": zone, "level_id": level_id, "kind": kind,
    })


def add_gw(gid, x, y, z, zone, level_id, name):
    gateways.append({
        "gateway_id": gid, "name": name,
        "x": float(x), "y": float(y), "z": float(z),
        "zone_id": zone, "level_id": level_id, "depth_m": float(y),
    })


def chain(ids, zone, level_id, prefix):
    for i in range(len(ids) - 1):
        add_edge(f"{prefix}_{i}", ids[i], ids[i + 1], zone, level_id, "tunnel")


# ---------------------------------------------------------------------------
# Surface collar + shaft columns through all levels
# ---------------------------------------------------------------------------
add_node("SURFACE_MAIN", MAIN_XZ[0], SURFACE_Y, MAIN_XZ[1], "surface", "SURFACE")
add_node("SURFACE_VENT", VENT_XZ[0], SURFACE_Y, VENT_XZ[1], "surface", "SURFACE")
add_node("SURFACE_ESCAPE", ESCAPE_XZ[0], SURFACE_Y, ESCAPE_XZ[1], "surface", "SURFACE")

prev_main, prev_vent, prev_esc = "SURFACE_MAIN", "SURFACE_VENT", "SURFACE_ESCAPE"
for lv in LEVELS:
    lid, y = lv["id"], lv["depth_m"]
    main = f"{lid}_LIFT"
    vent = f"{lid}_VENT"
    esc = f"{lid}_ESCAPE"
    add_node(main, MAIN_XZ[0], y, MAIN_XZ[1], "lift_station", lid)
    add_node(vent, VENT_XZ[0], y, VENT_XZ[1], "vent_station", lid)
    add_node(esc, ESCAPE_XZ[0], y, ESCAPE_XZ[1], "escape_station", lid)
    add_edge(f"MAIN_{prev_main}_to_{lid}", prev_main, main, "MAIN_SHAFT", None, "shaft")
    add_edge(f"VENT_{prev_vent}_to_{lid}", prev_vent, vent, "VENT_SHAFT", None, "vent_shaft")
    add_edge(f"ESC_{prev_esc}_to_{lid}", prev_esc, esc, "ESCAPE_SHAFT", None, "escape_shaft")
    prev_main, prev_vent, prev_esc = main, vent, esc


def build_level_footprint(lid: str, y: float, layout: str):
    """Unique horizontal networks per blueprint level sketches."""
    lift, vent, esc = f"{lid}_LIFT", f"{lid}_VENT", f"{lid}_ESCAPE"

    if layout == "L1":
        # Wide branching network with central loop (blueprint Level 1)
        pts = {
            "N": (0, 90), "N2": (35, 90), "NE": (80, 55),
            "E": (95, 0), "SE": (70, -60), "S": (0, -85),
            "SW": (-65, -55), "W": (-95, 10), "NW": (-55, 70),
            "LOOP_E": (40, 25), "LOOP_S": (25, -30), "LOOP_W": (-30, -15),
            "MINE_E": (130, 20), "MINE_W": (-130, 40),
            "WORK": (50, -90), "REFUGE": (-25, 35),
        }
        for k, (x, z) in pts.items():
            typ = "work_zone" if k.startswith("MINE") or k == "WORK" else "intersection"
            if k == "REFUGE":
                typ = "refuge"
            add_node(f"{lid}_{k}", x, y, z, typ, lid)

        # Central loop around lift
        chain([lift, f"{lid}_LOOP_E", f"{lid}_N2", f"{lid}_N", f"{lid}_NW",
               f"{lid}_REFUGE", f"{lid}_LOOP_W", f"{lid}_LOOP_S", lift],
              f"{lid}_LOOP", lid, f"{lid}_loop")
        chain([f"{lid}_LOOP_E", f"{lid}_NE", f"{lid}_E", f"{lid}_MINE_E"], f"{lid}_EAST", lid, f"{lid}_east")
        chain([f"{lid}_LOOP_S", f"{lid}_SE", f"{lid}_S", f"{lid}_WORK"], f"{lid}_SOUTH", lid, f"{lid}_south")
        chain([f"{lid}_LOOP_W", f"{lid}_SW", f"{lid}_W", f"{lid}_MINE_W"], f"{lid}_WEST", lid, f"{lid}_west")
        # Link secondary shafts into network
        add_edge(f"{lid}_to_vent", f"{lid}_NE", vent, f"{lid}_LINK", lid, "tunnel")
        add_edge(f"{lid}_to_esc", f"{lid}_SW", esc, f"{lid}_LINK", lid, "tunnel")

    elif layout == "L2":
        # More linear spine with long branches (blueprint Level 2)
        pts = {
            "E1": (50, 10), "E2": (110, 15), "E3": (160, 5),
            "W1": (-50, -5), "W2": (-110, 0), "W3": (-160, -10),
            "N1": (20, 70), "N2": (25, 120),
            "S1": (-15, -70), "S2": (-20, -125),
            "BRANCH": (90, -60), "WORK": (-80, 70), "REFUGE": (15, -20),
            "EMERG": (120, 60),
        }
        for k, (x, z) in pts.items():
            typ = "intersection"
            if k == "WORK":
                typ = "workshop"
            elif k == "REFUGE":
                typ = "refuge"
            elif k == "EMERG":
                typ = "emergency"
            elif k in ("E3", "W3", "N2", "S2"):
                typ = "work_zone"
            add_node(f"{lid}_{k}", x, y, z, typ, lid)

        chain([f"{lid}_W3", f"{lid}_W2", f"{lid}_W1", lift, f"{lid}_E1", f"{lid}_E2", f"{lid}_E3"],
              f"{lid}_SPINE", lid, f"{lid}_spine")
        chain([lift, f"{lid}_REFUGE", f"{lid}_S1", f"{lid}_S2"], f"{lid}_SOUTH", lid, f"{lid}_south")
        chain([f"{lid}_E1", f"{lid}_N1", f"{lid}_N2"], f"{lid}_NORTH", lid, f"{lid}_north")
        chain([f"{lid}_E2", f"{lid}_BRANCH"], f"{lid}_BRANCH", lid, f"{lid}_br")
        chain([f"{lid}_W1", f"{lid}_WORK"], f"{lid}_WORK", lid, f"{lid}_wk")
        chain([f"{lid}_E2", f"{lid}_EMERG"], f"{lid}_EMERG", lid, f"{lid}_em")
        add_edge(f"{lid}_to_vent", f"{lid}_E1", vent, f"{lid}_LINK", lid, "tunnel")
        add_edge(f"{lid}_to_esc", f"{lid}_W2", esc, f"{lid}_LINK", lid, "tunnel")

    elif layout == "L3":
        # Complex grid + large western loop (blueprint Level 3)
        pts = {
            "N": (0, 80), "NE": (60, 70), "E": (90, 0), "SE": (55, -70),
            "S": (0, -80), "SW": (-60, -65), "W": (-100, 0), "NW": (-70, 65),
            "C_N": (0, 35), "C_E": (40, 0), "C_S": (0, -35), "C_W": (-40, 0),
            "LOOP1": (-130, 40), "LOOP2": (-150, 0), "LOOP3": (-130, -40),
            "WORK": (70, 40), "REFUGE": (-20, 10), "EMERG": (40, -50),
            "MINE": (120, -30),
        }
        for k, (x, z) in pts.items():
            typ = "intersection"
            if k == "WORK":
                typ = "workshop"
            elif k == "REFUGE":
                typ = "refuge"
            elif k == "EMERG":
                typ = "emergency"
            elif k == "MINE":
                typ = "work_zone"
            add_node(f"{lid}_{k}", x, y, z, typ, lid)

        # Inner cross
        chain([f"{lid}_C_N", lift, f"{lid}_C_S"], f"{lid}_NS", lid, f"{lid}_ns")
        chain([f"{lid}_C_W", lift, f"{lid}_C_E"], f"{lid}_EW", lid, f"{lid}_ew")
        # Outer ring
        ring = [f"{lid}_N", f"{lid}_NE", f"{lid}_E", f"{lid}_SE", f"{lid}_S",
                f"{lid}_SW", f"{lid}_W", f"{lid}_NW", f"{lid}_N"]
        chain(ring, f"{lid}_RING", lid, f"{lid}_ring")
        # Spokes
        for a, b in [("N", "C_N"), ("E", "C_E"), ("S", "C_S"), ("W", "C_W")]:
            add_edge(f"{lid}_spoke_{a}", f"{lid}_{a}", f"{lid}_{b}", f"{lid}_SPOKE", lid, "tunnel")
        # Western loop
        chain([f"{lid}_W", f"{lid}_LOOP1", f"{lid}_LOOP2", f"{lid}_LOOP3", f"{lid}_SW"],
              f"{lid}_WLOOP", lid, f"{lid}_wloop")
        add_edge(f"{lid}_work", f"{lid}_NE", f"{lid}_WORK", f"{lid}_WORK", lid, "tunnel")
        add_edge(f"{lid}_ref", lift, f"{lid}_REFUGE", f"{lid}_REFUGE", lid, "tunnel")
        add_edge(f"{lid}_em", f"{lid}_SE", f"{lid}_EMERG", f"{lid}_EMERG", lid, "tunnel")
        add_edge(f"{lid}_mine", f"{lid}_E", f"{lid}_MINE", f"{lid}_MINE", lid, "tunnel")
        add_edge(f"{lid}_to_vent", f"{lid}_NE", vent, f"{lid}_LINK", lid, "tunnel")
        add_edge(f"{lid}_to_esc", f"{lid}_SW", esc, f"{lid}_LINK", lid, "tunnel")

    else:  # L4 — T-shaped junction with branches (blueprint Level 4)
        pts = {
            "N": (0, 100), "N2": (0, 150),
            "E": (80, 0), "E2": (130, 10), "E3": (170, -15),
            "W": (-80, 5), "W2": (-130, 0),
            "S_STUB": (10, -40),
            "WORK": (60, 50), "REFUGE": (-40, 20), "MINE": (-100, -50),
        }
        for k, (x, z) in pts.items():
            typ = "intersection"
            if k == "WORK":
                typ = "workshop"
            elif k == "REFUGE":
                typ = "refuge"
            elif k in ("N2", "E3", "MINE"):
                typ = "work_zone"
            add_node(f"{lid}_{k}", x, y, z, typ, lid)

        chain([f"{lid}_N2", f"{lid}_N", lift, f"{lid}_S_STUB"], f"{lid}_STEM", lid, f"{lid}_stem")
        chain([f"{lid}_W2", f"{lid}_W", lift, f"{lid}_E", f"{lid}_E2", f"{lid}_E3"],
              f"{lid}_ARM", lid, f"{lid}_arm")
        add_edge(f"{lid}_work", f"{lid}_E", f"{lid}_WORK", f"{lid}_WORK", lid, "tunnel")
        add_edge(f"{lid}_ref", f"{lid}_W", f"{lid}_REFUGE", f"{lid}_REFUGE", lid, "tunnel")
        add_edge(f"{lid}_mine", f"{lid}_W2", f"{lid}_MINE", f"{lid}_MINE", lid, "tunnel")
        add_edge(f"{lid}_to_vent", f"{lid}_E", vent, f"{lid}_LINK", lid, "tunnel")
        add_edge(f"{lid}_to_esc", f"{lid}_W2", esc, f"{lid}_LINK", lid, "tunnel")


def lv_name(lid: str) -> str:
    return next(lv["name"] for lv in LEVELS if lv["id"] == lid)


for lv in LEVELS:
    build_level_footprint(lv["id"], lv["depth_m"], lv["id"])

# Mild vehicle ramp between L2 and L3 (blueprint declines)
add_node("RAMP_L2", 90.0, LEVELS[1]["depth_m"], -40.0, "intersection", "L2")
add_node("RAMP_L3", 90.0, LEVELS[2]["depth_m"], -40.0, "intersection", "L3")
add_edge("RAMP_L2_join", "RAMP_L2", "L2_BRANCH", "L2_BRANCH", "L2", "tunnel")
add_edge("RAMP_L3_join", "RAMP_L3", "L3_EMERG", "L3_EMERG", "L3", "tunnel")
add_edge("RAMP_L2_L3", "RAMP_L2", "RAMP_L3", "DECLINE_RAMP", None, "ramp")


# ---------------------------------------------------------------------------
# Dense LoRa mesh — enough APs for multilateration + miner status backhaul
# Spacing ~55 m along drives; anchors at junctions / rooms / mid-shaft.
# ---------------------------------------------------------------------------
GW_SPACING_M = 55.0
GW_MIN_SEP_M = 32.0
PRIORITY_TYPES = {
    "lift_station", "refuge", "workshop", "emergency", "work_zone",
    "surface", "vent_station", "escape_station",
}


def _gw_too_close(x: float, y: float, z: float, min_sep: float = GW_MIN_SEP_M) -> bool:
    for g in gateways:
        dx = g["x"] - x
        dy = g["y"] - y
        dz = g["z"] - z
        if dx * dx + dy * dy + dz * dz < min_sep * min_sep:
            return True
    return False


def place_gateway_mesh() -> None:
    # Surface collar
    add_gw("GW-SURF", MAIN_XZ[0] + 12, SURFACE_Y, MAIN_XZ[1] + 8, "SURFACE", "SURFACE", "Surface collar LoRa")

    # Priority nodes (rooms, lifts, shaft stations, work faces, junctions)
    by_level: dict[str, int] = {}
    for node in sorted(nodes.values(), key=lambda nd: (nd["level_id"] or "", nd["id"])):
        if node["type"] not in PRIORITY_TYPES and node["type"] != "intersection":
            continue
        # Intersections: only keep if sparse enough for mesh fill to handle the rest
        sep = GW_MIN_SEP_M * (1.35 if node["type"] == "intersection" else 1.0)
        if _gw_too_close(node["x"], node["y"], node["z"], sep):
            continue
        lid = node["level_id"] or "SURFACE"
        by_level[lid] = by_level.get(lid, 0) + 1
        zone = next(
            (e["zone_id"] for e in edges if e["start"] == node["id"] or e["end"] == node["id"]),
            f"{lid}_MESH",
        )
        label = node["type"].replace("_", " ")
        add_gw(
            f"GW-{lid}-{by_level[lid]:02d}",
            node["x"], node["y"], node["z"],
            zone, lid,
            f"{lv_name(lid) if lid in {lv['id'] for lv in LEVELS} else 'Surface'} · {label}",
        )

    # Walk every drive / ramp / shaft and fill gaps so RSSI trilateration has 3+ hits
    for e in edges:
        a, b = nodes[e["start"]], nodes[e["end"]]
        length = e["length"]
        if length < GW_SPACING_M * 0.6:
            continue
        steps = max(1, int(length // GW_SPACING_M))
        # shafts: one mid-point is enough; tunnels: regular spacing
        if e["kind"] != "tunnel":
            fracs = [0.5]
        else:
            fracs = [(i + 1) / (steps + 1) for i in range(steps)]
        for frac in fracs:
            x = a["x"] + (b["x"] - a["x"]) * frac
            y = a["y"] + (b["y"] - a["y"]) * frac
            z = a["z"] + (b["z"] - a["z"]) * frac
            if _gw_too_close(x, y, z):
                continue
            lid = e.get("level_id") or a.get("level_id") or "SURFACE"
            if e["kind"] != "tunnel":
                # Mid-shaft units sit between levels
                lid = a.get("level_id") or lid
            add_gw(
                f"GW-MESH-{len(gateways)+1:03d}",
                x, y, z,
                e["zone_id"], lid,
                f"Tunnel mesh · {e['zone_id']}",
            )


place_gateway_mesh()


def nearest_gateway_id(x: float, y: float, z: float) -> str:
    best, best_d = gateways[0]["gateway_id"], 1e18
    for g in gateways:
        d = (g["x"] - x) ** 2 + (g["y"] - y) ** 2 + (g["z"] - z) ** 2
        if d < best_d:
            best, best_d = g["gateway_id"], d
    return best


# Workers distributed across blueprint levels
edge_ids = {e["id"] for e in edges}


def first_edge(*prefixes: str) -> str:
    for e in edges:
        if any(e["id"].startswith(p) for p in prefixes) and e["kind"] == "tunnel":
            return e["id"]
    raise RuntimeError(prefixes)


workers = [
    {"worker_id": "W01", "name": "Thabo", "role": "Blaster", "wearable_id": "WD-W01",
     "start_edge": first_edge("L1_loop"), "walking_speed_mps": 1.2, "behavior_profile": "steady"},
    {"worker_id": "W02", "name": "Sipho", "role": "Mechanic", "wearable_id": "WD-W02",
     "start_edge": first_edge("L1_east"), "walking_speed_mps": 1.1, "behavior_profile": "patrol"},
    {"worker_id": "W03", "name": "Lerato", "role": "Loader Operator", "wearable_id": "WD-W03",
     "start_edge": "MAIN_SURFACE_MAIN_to_L1", "walking_speed_mps": 0.85, "behavior_profile": "shaft_rider"},
    {"worker_id": "W04", "name": "Naledi", "role": "Mechanic", "wearable_id": "WD-W04",
     "start_edge": first_edge("L2_spine"), "walking_speed_mps": 1.15, "behavior_profile": "steady"},
    {"worker_id": "W05", "name": "Johan", "role": "Loader Operator", "wearable_id": "WD-W05",
     "start_edge": first_edge("L2_south"), "walking_speed_mps": 1.05, "behavior_profile": "steady"},
    {"worker_id": "W06", "name": "Pieter", "role": "Driller", "wearable_id": "WD-W06",
     "start_edge": "MAIN_L1_LIFT_to_L2", "walking_speed_mps": 0.9, "behavior_profile": "shaft_rider"},
    {"worker_id": "W07", "name": "Ayanda", "role": "Supervisor", "wearable_id": "WD-W07",
     "start_edge": first_edge("L3_ring"), "walking_speed_mps": 0.95, "behavior_profile": "steady"},
    {"worker_id": "W08", "name": "Kagiso", "role": "Blaster", "wearable_id": "WD-W08",
     "start_edge": first_edge("L3_wloop"), "walking_speed_mps": 1.1, "behavior_profile": "patrol"},
    {"worker_id": "W09", "name": "Tumi", "role": "Surveyor", "wearable_id": "WD-W09",
     "start_edge": "MAIN_L2_LIFT_to_L3", "walking_speed_mps": 0.88, "behavior_profile": "shaft_rider"},
    {"worker_id": "W10", "name": "Bongani", "role": "Geologist", "wearable_id": "WD-W10",
     "start_edge": first_edge("L4_arm"), "walking_speed_mps": 1.0, "behavior_profile": "steady"},
    {"worker_id": "W11", "name": "Refilwe", "role": "Blaster", "wearable_id": "WD-W11",
     "start_edge": first_edge("L4_stem"), "walking_speed_mps": 1.05, "behavior_profile": "patrol"},
    {"worker_id": "W12", "name": "Mpho", "role": "Mechanic", "wearable_id": "WD-W12",
     "start_edge": "VENT_L1_VENT_to_L2", "walking_speed_mps": 0.8, "behavior_profile": "shaft_rider"},
    {"worker_id": "W13", "name": "Katlego", "role": "Supervisor", "wearable_id": "WD-W13",
     "start_edge": first_edge("L1_west"), "walking_speed_mps": 1.1, "behavior_profile": "steady"},
    {"worker_id": "W14", "name": "Dineo", "role": "Loader Operator", "wearable_id": "WD-W14",
     "start_edge": "RAMP_L2_L3", "walking_speed_mps": 0.75, "behavior_profile": "shaft_rider"},
    {"worker_id": "W15", "name": "Vusi", "role": "Electrician", "wearable_id": "WD-W15",
     "start_edge": "ESC_L2_ESCAPE_to_L3", "walking_speed_mps": 0.95, "behavior_profile": "patrol"},
]

for w in workers:
    assert w["start_edge"] in edge_ids, w["start_edge"]

# Fixed sensors near lift / vent on each level — linked to nearest radio unit
sensors = []
sid = 1
for lv in LEVELS:
    lid, y = lv["id"], lv["depth_m"]
    for typ, unit, name, dx, dz in [
        ("CH4", "%LEL", "Methane", 8, 8),
        ("O2", "%", "Oxygen", -8, -8),
        ("AIRFLOW", "m/s", "Airflow", VENT_XZ[0], VENT_XZ[1]),
    ]:
        sx = dx if typ != "AIRFLOW" else VENT_XZ[0]
        sz = dz if typ != "AIRFLOW" else VENT_XZ[1]
        sensors.append({
            "sensor_id": f"ES-{sid:02d}", "name": f"{name} · {lv['name']}",
            "sensor_type": typ, "x": sx, "y": y, "z": sz,
            "zone_id": f"{lid}_LINK", "level_id": lid, "unit": unit,
            "linked_gateway_id": nearest_gateway_id(sx, y, sz),
            "battery_pct": 88, "maintenance_due_days": 40 + sid,
        })
        sid += 1

mine = {
    "name": "Smart Mine 3D",
    "blueprint": "ChatGPT Image Sep 21, 2026 — multi-level shafts + unique level footprints",
    "coordinate_system": {
        "x": "east_west_m", "y": "elevation_m", "z": "north_south_m",
        "surface_y": SURFACE_Y,
    },
    "levels": [
        {"id": "SURFACE", "name": "Surface", "depth_m": SURFACE_Y, "label": "Surface"},
        *LEVELS,
    ],
    "nodes": list(nodes.values()),
    "edges": edges,
    "portals": [],
    "zones": sorted({e["zone_id"] for e in edges}),
    "gateway_locations": gateways,
}

(root / "mine.json").write_text(json.dumps(mine, indent=2) + "\n", encoding="utf-8")
(root / "gateways.json").write_text(json.dumps({
    # Dense mesh (~55 m); radius sized so a miner typically hears 3–5 units for multilateration
    "coverage_radius_m": 95,
    "path_loss_exponent": 2.8,
    "reference_rssi_at_1m": -40,
    "noise_std_db": 4.0,
    "gateways": gateways,
}, indent=2) + "\n", encoding="utf-8")
(root / "workers.json").write_text(json.dumps({"workers": workers}, indent=2) + "\n", encoding="utf-8")
(root / "sensors.json").write_text(json.dumps({"sensors": sensors}, indent=2) + "\n", encoding="utf-8")

print("nodes", len(nodes), "edges", len(edges), "gateways", len(gateways))
print("depths", sorted({n["y"] for n in nodes.values()}))
