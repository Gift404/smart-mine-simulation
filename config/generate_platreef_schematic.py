"""
Build the "Platreef schematic" simulation config set from the external
Platreef layout export (source/platreef_layout.json).

Only the map and layout come from the export: shafts, levels, drifts, raises,
ore passes, rooms, beacons and stope blocks. Everything else (worker roster and
behaviours, vehicle cycle logic, radio parameters, sensor schema, geofence
schema, thresholds) reuses the conventions of the primary simulation in
config/, so the existing simulator code runs unchanged on this map.

Source axes already match the simulator: x = east, y = elevation (negative
underground), z = north.

    python config/generate_platreef_schematic.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "simulations" / "platreef_schematic"
SOURCE = OUT / "source" / "platreef_layout.json"

src = json.loads(SOURCE.read_text(encoding="utf-8"))


def nid(source_id: str) -> str:
    return source_id.replace("~", "-")


# ---------------------------------------------------------------------------
# Levels
# ---------------------------------------------------------------------------
LEVELS = [
    {"id": "SURFACE", "name": "Surface", "depth_m": 0.0, "label": "Surface · collars"},
    {"id": "L750", "name": "750 m Level", "depth_m": -750.0, "label": "750 m Level"},
    {"id": "L850", "name": "850 m Level", "depth_m": -850.0, "label": "850 m Level"},
    {"id": "L950", "name": "950 m Level", "depth_m": -950.0, "label": "950 m Level"},
    {"id": "L996", "name": "996 m Level", "depth_m": -996.0, "label": "996 m · pump station"},
    {"id": "L1090", "name": "1 040–1 090 m", "depth_m": -1075.0, "label": "1 090 m · silos & crusher"},
]
LEVEL_BY_LVL = {0: "SURFACE", 750: "L750", 850: "L850", 950: "L950", 996: "L996", 1000: "L1090", 1090: "L1090"}

# ---------------------------------------------------------------------------
# Node types → simulator vocabulary (drives worker work, vehicle targets, 3D rooms)
# ---------------------------------------------------------------------------
TYPE_MAP = {
    "beacon": "intersection",
    "junction": "intersection",
    "refuge": "refuge",
    "sub": "workshop",        # HV substation bay: electricians / mechanics service point
    "paste": "emergency",
    "mag": "restricted",      # explosives magazine
    "work": "workshop",
    "silo": "silo",
    "crusher": "crusher",
    "pump": "emergency",
    "fan": "vent_station",
}
TYPE_OVERRIDES = {
    # Strike-drive faces next to the stope blocks
    **{k: "work_zone" for k in ("OD8N1", "OD8S1", "OD8S2", "OD8S3", "H3N1", "H3N2", "H3S1", "H3S2")},
    # Ore-pass tips / feet
    **{k: "ore_pass" for k in ("OP2T", "H250", "H391")},
    # Dead-end ventilation raise bottoms
    **{k: "vent_station" for k in ("ER1", "OD8N2", "H3S3")},
}


def node_type(n: dict) -> str:
    if n["id"] in TYPE_OVERRIDES:
        return TYPE_OVERRIDES[n["id"]]
    if n["type"] == "station":
        return "surface" if n["lvl"] == 0 else "lift_station"
    return TYPE_MAP.get(n["type"], "intersection")


# ---------------------------------------------------------------------------
# Zones (per-level areas) — used by alerts, zone gas, risk, sensors
# ---------------------------------------------------------------------------
SOURCE_IDS = {n["id"] for n in src["nodes"]}
ORE_DRIVE_PREFIXES = ("OD8", "H3", "H1103", "RC850", "RC950B")
STATION_IDS = {"WORK950"}


def base_zone(source_id: str, level_id: str) -> str:
    if level_id == "SURFACE":
        return "SURFACE"
    if level_id == "L996":
        return "L996_STATION"
    if level_id == "L1090":
        return "L1090_CRUSHER"
    if source_id.startswith(("S1_", "S2_", "S3_")) or source_id in STATION_IDS:
        return f"{level_id}_STATION"
    if source_id.startswith(ORE_DRIVE_PREFIXES):
        return f"{level_id}_ORE_DRIVE"
    return f"{level_id}_HAULAGE" if level_id == "L950" else f"{level_id}_WEST"


def split_beacon(source_id: str) -> tuple[str, str]:
    """'A~B<n>' → (A, B) where B is the longest real node id prefix of the tail."""
    a, tail = source_id.split("~", 1)
    b = max((k for k in SOURCE_IDS if tail.startswith(k) and "~" not in k), key=len)
    return a, b


level_of: dict[str, str] = {}
zone_of: dict[str, str] = {}
for n in src["nodes"]:
    level_of[n["id"]] = LEVEL_BY_LVL[n["lvl"]]
for n in src["nodes"]:
    if n["type"] == "beacon":
        continue
    zone_of[n["id"]] = base_zone(n["id"], level_of[n["id"]])
for n in src["nodes"]:
    if n["type"] != "beacon":
        continue
    a, b = split_beacon(n["id"])
    za, zb = zone_of[a], zone_of[b]
    zone_of[n["id"]] = zb if za.endswith("_STATION") else za

# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------
nodes: dict[str, dict] = {}
for n in src["nodes"]:
    out = {
        "id": nid(n["id"]),
        "x": float(n["x"]),
        "y": float(n["y"]),
        "z": float(n["z"]),
        "type": node_type(n),
        "level_id": level_of[n["id"]],
        "depth_m": float(n["y"]),
        "name": n["name"],
        "status": n.get("status", "developed"),
        "source_id": n["id"],
        "source_type": n["type"],
    }
    nodes[out["id"]] = out


def dist3(a: str, b: str) -> float:
    na, nb = nodes[a], nodes[b]
    return math.dist((na["x"], na["y"], na["z"]), (nb["x"], nb["y"], nb["z"]))


# ---------------------------------------------------------------------------
# Edges
# ---------------------------------------------------------------------------
KIND_MAP = {"drift": "tunnel", "ramp": "ramp", "shaft": "shaft", "raise": "vent_shaft", "orepass": "ore_pass"}
KIND_PREFIX = {"tunnel": "DR", "ramp": "RP", "shaft": "SH", "vent_shaft": "VR", "ore_pass": "OP"}


def edge_zone(e: dict, kind: str) -> str:
    if kind == "shaft":
        return f"{e['a'].split('_')[0]}_SHAFT"
    if kind == "vent_shaft":
        return "VENT_SHAFT"
    if kind == "ore_pass":
        return "ORE_PASS"
    if kind == "ramp":
        return "DECLINE_RAMP"
    za, zb = zone_of[e["a"]], zone_of[e["b"]]
    if za.endswith("_STATION") and not zb.endswith("_STATION"):
        return zb
    return za


def edge_level(e: dict, kind: str) -> str | None:
    if kind != "tunnel":
        return None
    la, lb = level_of[e["a"]], level_of[e["b"]]
    return la if la == lb else lb


edges: list[dict] = []
for e in src["edges"]:
    kind = KIND_MAP[e["type"]]
    a, b = nid(e["a"]), nid(e["b"])
    speed = 0.7 if kind in ("shaft", "vent_shaft", "ore_pass") else (0.9 if kind == "ramp" else 1.2)
    edges.append({
        "id": f"{KIND_PREFIX[kind]}_{a}_{b}",
        "start": a,
        "end": b,
        "length": round(dist3(a, b), 2),
        "direction": "both",
        "speed_limit": speed,
        "zone_id": edge_zone(e, kind),
        "level_id": edge_level(e, kind),
        "kind": kind,
        "status": e.get("st", "developed"),
    })

edge_by_pair = {(e["start"], e["end"]): e["id"] for e in edges}
edge_by_pair.update({(e["end"], e["start"]): e["id"] for e in edges})


def edge_id(a: str, b: str) -> str:
    return edge_by_pair[(nid(a), nid(b))]


# ---------------------------------------------------------------------------
# Stope blocks (visual orebody context; not part of the walkable graph)
# ---------------------------------------------------------------------------
STOPE_LEVELS = [lv for lv in LEVELS if lv["id"] in ("L750", "L850", "L950")]
stopes = [
    {
        **s,
        "level_id": min(STOPE_LEVELS, key=lambda lv: abs(lv["depth_m"] - s["y"]))["id"],
    }
    for s in src.get("stopes", [])
]

# ---------------------------------------------------------------------------
# Gateways — every beacon and underground station, then fill gaps at facilities
# ---------------------------------------------------------------------------
MIN_GATEWAY_SPACING_M = 80.0
gateways: list[dict] = []


def add_gateway(node: dict, label: str) -> None:
    gateways.append({
        "gateway_id": f"GW-{len(gateways) + 1:02d}",
        "name": f"Platreef schematic · {node['level_id']} · {label}",
        "x": node["x"] + 3.0,
        "y": node["y"],
        "z": node["z"] - 2.0,
        "zone_id": zone_of[node["source_id"]],
        "level_id": node["level_id"],
        "depth_m": node["y"],
    })


def far_from_gateways(node: dict) -> bool:
    return all(
        math.dist((node["x"], node["y"], node["z"]), (g["x"], g["y"], g["z"])) >= MIN_GATEWAY_SPACING_M
        for g in gateways
    )


underground = [n for n in nodes.values() if n["level_id"] != "SURFACE"]
for n in underground:
    if n["source_type"] == "beacon":
        add_gateway(n, "Beacon")
for n in underground:
    if n["source_type"] == "station":
        add_gateway(n, n["name"])
for n in underground:
    if n["source_type"] not in ("beacon", "station") and far_from_gateways(n):
        add_gateway(n, n["name"])
add_gateway(nodes["S1_0"], "Shaft 1 collar")

# ---------------------------------------------------------------------------
# Fixed environmental sensors (same schema as the primary sim)
# ---------------------------------------------------------------------------
SENSOR_SITES = {
    "L750": {"CH4": "OP2T", "O2": "J7a", "AIRFLOW": "ER1"},
    "L850": {"CH4": "OD8C", "O2": "J8a", "AIRFLOW": "OD8N2"},
    "L950": {"CH4": "H1103", "O2": "H391", "AIRFLOW": "H3S3"},
    "L996": {"CH4": "PUMP996", "O2": "RC996", "AIRFLOW": "S1_996"},
}
SENSOR_META = {"CH4": ("%LEL", "methane"), "O2": ("%", "oxygen"), "AIRFLOW": ("m/s", "airflow")}


def nearest_gateway(x: float, y: float, z: float) -> str:
    return min(gateways, key=lambda g: math.dist((x, y, z), (g["x"], g["y"], g["z"])))["gateway_id"]


sensors: list[dict] = []
for level_id, sites in SENSOR_SITES.items():
    for kind, source_id in sites.items():
        n = nodes[nid(source_id)]
        unit, label = SENSOR_META[kind]
        i = len(sensors) + 1
        x, y, z = n["x"] + 4.0, n["y"], n["z"] + 4.0
        sensors.append({
            "sensor_id": f"ES-{i:02d}",
            "name": f"Platreef schematic {level_id} {label} · {n['name']}",
            "sensor_type": kind,
            "x": x, "y": y, "z": z,
            "zone_id": zone_of[source_id],
            "level_id": level_id,
            "unit": unit,
            "linked_gateway_id": nearest_gateway(x, y, z),
            "battery_pct": 85 + (i % 10),
            "maintenance_due_days": 60 + i * 7,
        })
# Exactly one unit is due for service (shows as "Degraded" on the Systems page: due ≤ 45 days)
next(s for s in reversed(sensors) if s["sensor_type"] == "AIRFLOW")["maintenance_due_days"] = 21

# ---------------------------------------------------------------------------
# Geofences (same schema / severities / role rules as the primary sim)
# ---------------------------------------------------------------------------
geofences = {
    "description": "Restricted geofences for the Platreef schematic layout. Unauthorized entry vibrates the wearable and raises system alerts.",
    "default_radius_m": 30,
    "fences": [
        {
            "fence_id": "GF-MAGAZINE",
            "name": "850 m explosives magazine",
            "node_ids": ["MAG850"],
            "zone_ids": [],
            "radius_m": 30,
            "severity": "CRITICAL",
            "allowed_roles": ["Blaster"],
            "message": "Restricted explosives magazine - unauthorized entry",
        },
        {
            "fence_id": "GF-OREPASS",
            "name": "Ore pass column",
            "node_ids": [],
            "zone_ids": ["ORE_PASS"],
            "radius_m": 20,
            "severity": "WARNING",
            "allowed_roles": ["Supervisor", "Geologist", "Loader Operator"],
            "message": "Restricted ore-pass column — fall / rock hazard",
        },
        {
            "fence_id": "GF-CRUSHER",
            "name": "Silos & crusher chamber",
            "node_ids": ["SILO", "CRUSH"],
            "zone_ids": [],
            "radius_m": 30,
            "severity": "WARNING",
            "allowed_roles": ["Loader Operator", "Mechanic", "Electrician", "Supervisor"],
            "message": "Restricted crushing / silo area",
        },
        {
            "fence_id": "GF-PUMP",
            "name": "996 m main pump station & sump",
            "node_ids": ["PUMP996"],
            "zone_ids": [],
            "radius_m": 25,
            "severity": "WARNING",
            "allowed_roles": ["Electrician", "Mechanic", "Supervisor"],
            "message": "Restricted pump station / sump — flood & electrical hazard",
        },
        {
            "fence_id": "GF-SUBSTATION",
            "name": "HV substations",
            "node_ids": ["SUB750", "SUB950"],
            "zone_ids": [],
            "radius_m": 20,
            "severity": "WARNING",
            "allowed_roles": ["Electrician", "Mechanic", "Supervisor"],
            "message": "Restricted HV substation — authorized electrical staff only",
        },
    ],
}

# ---------------------------------------------------------------------------
# Workers: primary roster (names, roles, speeds, behaviours) at new start edges
# ---------------------------------------------------------------------------
WORKER_STARTS = {
    "W01": ("J8a", "MAG850"),
    "W02": ("S2_950~WORK9501", "WORK950"),
    "W03": ("H391~H7002", "H391~H7003"),
    "W04": ("J7a", "SUB750"),
    "W05": ("OD8C", "OD8S1"),
    "W06": ("S2_750", "S2_850"),
    "W07": ("S1_950", "S2_950"),
    "W08": ("OD8S1", "OD8S2"),
    "W09": ("S1_750", "S1_850"),
    "W10": ("H1103", "H3N1"),
    "W11": ("H3S1", "H3S2"),
    "W12": ("S2_950", "S2_996"),
    "W13": ("S1_750", "S2_750"),
    "W14": ("H1103", "H3S1"),
    "W15": ("H100", "SUB950"),
}
primary_workers = json.loads((ROOT / "workers.json").read_text(encoding="utf-8"))["workers"]
workers = []
for w in primary_workers:
    a, b = WORKER_STARTS[w["worker_id"]]
    out = {k: v for k, v in w.items() if k not in ("start_edge", "start_distance_fraction")}
    out["start_edge"] = edge_id(a, b)
    workers.append(out)

# ---------------------------------------------------------------------------
# Vehicles: primary fleet IDs / drivers, cycles retargeted to this layout
# ---------------------------------------------------------------------------
vehicles = {
    "vehicles": [
        {
            "vehicle_id": "LHD-01",
            "name": "LHD 14t · 850 ore drive",
            "kind": "lhd",
            "driver_worker_id": "W05",
            "start_edge": edge_id("OD8C", "OD8S1"),
            "speed_mps": 3.2,
            "load_node_ids": ["OD8N1", "OD8S1", "OD8S2", "OD8S3"],
            "dump_node_ids": ["OD8C"],
        },
        {
            "vehicle_id": "LHD-02",
            "name": "LHD 18t · 950 strike drives",
            "kind": "lhd",
            "driver_worker_id": "W14",
            "start_edge": edge_id("H1103", "H3S1"),
            "speed_mps": 3.0,
            "load_node_ids": ["H3N1", "H3N2", "H3S1", "H3S2"],
            "dump_node_ids": ["H1103"],
        },
        {
            "vehicle_id": "TRK-01",
            "name": "54t Truck · 950 haulage → silos",
            "kind": "ore_trailer",
            "driver_worker_id": "W03",
            "start_edge": edge_id("H391~H7002", "H391~H7003"),
            "speed_mps": 2.8,
            "load_node_ids": ["H1103", "H391", "H250"],
            "dump_node_ids": ["SILO"],
        },
        {
            "vehicle_id": "TRK-02",
            "name": "42t Truck · ore-pass feeder",
            "kind": "ore_trailer",
            "driver_worker_id": None,
            "start_edge": edge_id("H100", "H100~H2501"),
            "speed_mps": 2.5,
            "load_node_ids": ["H391", "H250"],
            "dump_node_ids": ["SILO", "CRUSH"],
        },
        {
            "vehicle_id": "TRK-03",
            "name": "30t Truck · 750 development muck",
            "kind": "ore_trailer",
            "driver_worker_id": None,
            "start_edge": edge_id("OP2T", "OP2T~ER11"),
            "speed_mps": 2.4,
            "load_node_ids": ["ER1"],
            "dump_node_ids": ["OP2T"],
        },
    ]
}

# ---------------------------------------------------------------------------
# Default 3D framing (centre of the underground footprint)
# ---------------------------------------------------------------------------
xs = [n["x"] for n in underground]
ys = [n["y"] for n in underground]
zs = [n["z"] for n in underground]
cx, cz = (min(xs) + max(xs)) / 2, (min(zs) + max(zs)) / 2
view = {
    "target": [round(cx), round((min(ys) + max(ys)) / 2), round(cz)],
    "camera_offset": [1150, 620, 1200],
    "overview_distance": 1800,
    "level_plane": {
        "center": [round(cx), round(cz)],
        "half_size": math.ceil(max(max(xs) - min(xs), max(zs) - min(zs)) / 2 + 80),
    },
}

# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------
mine = {
    "name": "Platreef Mine — schematic underground model",
    "description": src["meta"]["accuracy"],
    "location": "Near Mokopane, Limpopo Province, South Africa",
    "coordinate_system": {
        "x": "east_m", "y": "elevation_m", "z": "north_m",
        "note": "Origin = Shaft 1 collar; Y=0 at surface, underground levels negative",
    },
    "source": {
        "title": src["meta"]["title"],
        "version": src["meta"]["version"],
        "sources": src["meta"]["sources"],
    },
    "levels": LEVELS,
    "nodes": list(nodes.values()),
    "edges": edges,
    "zones": sorted({e["zone_id"] for e in edges}),
    "portals": [],
    "stopes": stopes,
    "stope_size_m": [80, 24, 55],
    "view": view,
}


def write(name: str, data: dict) -> None:
    (OUT / name).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


OUT.mkdir(parents=True, exist_ok=True)
write("mine.json", mine)
write("gateways.json", {
    "coverage_radius_m": 110,
    "path_loss_exponent": 2.9,
    "reference_rssi_at_1m": -40,
    "noise_std_db": 4.0,
    "gateways": gateways,
})
write("sensors.json", {"sensors": sensors})
write("geofences.json", geofences)
write("workers.json", {"workers": workers})
write("vehicles.json", vehicles)

print(f"mine.json      nodes={len(nodes)} edges={len(edges)} levels={len(LEVELS)} stopes={len(stopes)} zones={len(mine['zones'])}")
print(f"gateways.json  count={len(gateways)}")
print(f"sensors.json   count={len(sensors)}")
print(f"workers.json   count={len(workers)}")
print(f"vehicles.json  count={len(vehicles['vehicles'])}")
