"""
Generate a Platreef-inspired 3D mine graph from public IDP/FS descriptions
(Ivanhoe Platreef Integrated Development Plan / feasibility disclosures).

This is an INSPIRED reconstruction for simulation/education — not a surveyed
copy of proprietary underground plans. Layout cues taken from public text:

  - Mokopane, Limpopo, South Africa (PGM–Ni–Cu–Au)
  - Shaft 1: ~986 m, Ø7.25 m — Phase-1 access / ventilation intake
  - Shaft 2: ~996 m, Ø10 m — personnel & material (logistics)
  - Shaft 3: primary rock-hoisting (tips, crusher, conveyor, loading)
  - Shaft 4 / 5: ventilation (raisebored ~Ø5.1 m); 6–7 future exhaust
  - Main haulage levels: 750 m, 850 m, 950 m, 1 050 m
  - Interconnecting ramps; ore passes; truck tips on 750/850;
    crushing station + conveyor on 950 m Level feeding Shaft 3
  - Workshops on main levels; satellite workshops near stopes
  - Production areas (drift-and-fill / longhole style stopes)
  - Fault avoidance labels: Tshukudu / Nkwe corridors (no critical infra)

Coords: X=east, Y=elevation (0 surface, negative depth), Z=north
"""
from __future__ import annotations

import json
import math
from pathlib import Path

root = Path(__file__).resolve().parent

# Real Platreef main-level depths (metres below surface → negative Y)
LEVELS = [
    {"id": "L750", "name": "750 m Level", "depth_m": -750.0, "label": "750 m Level"},
    {"id": "L850", "name": "850 m Level", "depth_m": -850.0, "label": "850 m Level"},
    {"id": "L950", "name": "950 m Level", "depth_m": -950.0, "label": "950 m Level"},
    {"id": "L1050", "name": "1 050 m Level", "depth_m": -1050.0, "label": "1 050 m Level"},
]

SURFACE_Y = 0.0

# Shaft collar / column positions (XZ) — spread for readable 3D spacing (~2.4× prior footprint)
# Looking roughly north-east toward the production side (positive X / +Z).
SHAFTS = {
    "S1": {"xz": (0.0, 0.0), "role": "access_vent", "name": "Shaft 1 · access / vent intake", "diameter_m": 7.25},
    "S2": {"xz": (-130.0, 90.0), "role": "personnel", "name": "Shaft 2 · personnel & material", "diameter_m": 10.0},
    "S3": {"xz": (170.0, 45.0), "role": "hoisting", "name": "Shaft 3 · rock hoisting", "diameter_m": 5.1},
    "S4": {"xz": (100.0, -150.0), "role": "vent_exhaust", "name": "Shaft 4 · ventilation", "diameter_m": 5.1},
    "S5": {"xz": (-100.0, -130.0), "role": "vent_intake", "name": "Shaft 5 · ventilation intake", "diameter_m": 5.1},
}

nodes: dict[str, dict] = {}
edges: list[dict] = []
gateways: list[dict] = []
sensors: list[dict] = []


def add_node(nid, x, y, z, typ, level_id, name=None):
    n = {
        "id": nid, "x": float(x), "y": float(y), "z": float(z),
        "type": typ, "level_id": level_id, "depth_m": float(y),
    }
    if name:
        n["name"] = name
    nodes[nid] = n


def dist3(a, b):
    na, nb = nodes[a], nodes[b]
    return ((nb["x"] - na["x"]) ** 2 + (nb["y"] - na["y"]) ** 2 + (nb["z"] - na["z"]) ** 2) ** 0.5


def add_edge(eid, a, b, zone, level_id, kind="tunnel", speed=None):
    if speed is None:
        speed = 0.7 if kind in ("shaft", "vent_shaft", "ore_pass") else (0.9 if kind == "ramp" else 1.2)
    edges.append({
        "id": eid, "start": a, "end": b,
        "length": round(dist3(a, b), 2),
        "direction": "both",
        "speed_limit": speed,
        "zone_id": zone, "level_id": level_id, "kind": kind,
    })


def chain(ids, zone, level_id, prefix, kind="tunnel"):
    for i in range(len(ids) - 1):
        add_edge(f"{prefix}_{i}", ids[i], ids[i + 1], zone, level_id, kind)


def add_gw(gid, x, y, z, zone, level_id, name):
    gateways.append({
        "gateway_id": gid, "name": name,
        "x": float(x), "y": float(y), "z": float(z),
        "zone_id": zone, "level_id": level_id, "depth_m": float(y),
    })


# ---------------------------------------------------------------------------
# Surface complex (Mokopane / Platreef)
# ---------------------------------------------------------------------------
add_node("SURFACE_S1", SHAFTS["S1"]["xz"][0], SURFACE_Y, SHAFTS["S1"]["xz"][1], "surface", "SURFACE",
         "Shaft 1 collar")
add_node("SURFACE_S2", SHAFTS["S2"]["xz"][0], SURFACE_Y, SHAFTS["S2"]["xz"][1], "surface", "SURFACE",
         "Shaft 2 collar · P&M")
add_node("SURFACE_S3", SHAFTS["S3"]["xz"][0], SURFACE_Y, SHAFTS["S3"]["xz"][1], "surface", "SURFACE",
         "Shaft 3 collar · rock hoist")
add_node("SURFACE_S4", SHAFTS["S4"]["xz"][0], SURFACE_Y, SHAFTS["S4"]["xz"][1], "surface", "SURFACE",
         "Shaft 4 collar · vent")
add_node("SURFACE_S5", SHAFTS["S5"]["xz"][0], SURFACE_Y, SHAFTS["S5"]["xz"][1], "surface", "SURFACE",
         "Shaft 5 collar · vent intake")
add_node("SURFACE_CONCENTRATOR", 290.0, SURFACE_Y, -95.0, "workshop", "SURFACE",
         "Phase 1 concentrator · 0.77 Mtpa")
add_node("SURFACE_BAC", -50.0, SURFACE_Y, 60.0, "emergency", "SURFACE",
         "Bulk air coolers (BAC)")
add_node("SURFACE_YARD", 70.0, SURFACE_Y, -70.0, "intersection", "SURFACE", "Surface yard")

# Surface roads between collars
chain(["SURFACE_S1", "SURFACE_YARD", "SURFACE_S3", "SURFACE_CONCENTRATOR"], "SURFACE", "SURFACE", "SURF_ROAD")
add_edge("SURF_S1_S2", "SURFACE_S1", "SURFACE_S2", "SURFACE", "SURFACE")
add_edge("SURF_S1_BAC", "SURFACE_S1", "SURFACE_BAC", "SURFACE", "SURFACE")
add_edge("SURF_S1_S5", "SURFACE_S1", "SURFACE_S5", "SURFACE", "SURFACE")
add_edge("SURF_S3_S4", "SURFACE_S3", "SURFACE_S4", "SURFACE", "SURFACE")

# ---------------------------------------------------------------------------
# Shaft stations on every main level
# ---------------------------------------------------------------------------
prev = {k: f"SURFACE_{k}" for k in SHAFTS}
for lv in LEVELS:
    lid, y = lv["id"], lv["depth_m"]
    for sid, meta in SHAFTS.items():
        x, z = meta["xz"]
        if meta["role"] == "hoisting":
            typ = "lift_station"
        elif meta["role"] in ("vent_exhaust", "vent_intake", "access_vent"):
            typ = "vent_station" if "vent" in meta["role"] else "lift_station"
        else:
            typ = "lift_station"
        # Shaft 1 & 2 are lift/personnel stations; S3 hoisting tip station
        if sid == "S1":
            typ = "lift_station"
        elif sid == "S2":
            typ = "lift_station"
        elif sid == "S3":
            typ = "lift_station"
        elif sid in ("S4", "S5"):
            typ = "vent_station"
        nid = f"{lid}_{sid}"
        add_node(nid, x, y, z, typ, lid, f"{meta['name']} · {lv['name']}")
        kind = "shaft" if sid in ("S1", "S2", "S3") else "vent_shaft"
        zone = f"{sid}_SHAFT"
        add_edge(f"{sid}_{prev[sid]}_to_{lid}", prev[sid], nid, zone, None, kind)
        prev[sid] = nid

# ---------------------------------------------------------------------------
# Per-level development: haulage loop, tips, workshops, stopes, ramps
# ---------------------------------------------------------------------------

def build_level(lid: str, y: float, stope_bias: str):
    """Build one Platreef main haulage level footprint."""
    s1, s2, s3, s4, s5 = f"{lid}_S1", f"{lid}_S2", f"{lid}_S3", f"{lid}_S4", f"{lid}_S5"
    zone = f"{lid}_HAULAGE"

    # Dedicated truck haulage ring around shaft complex (separates logistics)
    h_n = f"{lid}_HAUL_N"
    h_e = f"{lid}_HAUL_E"
    h_s = f"{lid}_HAUL_S"
    h_w = f"{lid}_HAUL_W"
    add_node(h_n, 25.0, y, 220.0, "intersection", lid, f"{lid} north haulage")
    add_node(h_e, 310.0, y, 25.0, "intersection", lid, f"{lid} east haulage")
    add_node(h_s, 50.0, y, -220.0, "intersection", lid, f"{lid} south haulage")
    add_node(h_w, -240.0, y, 15.0, "intersection", lid, f"{lid} west haulage")
    chain([h_n, h_e, h_s, h_w, h_n], zone, lid, f"{lid}_RING")

    # Connect shafts into haulage
    add_edge(f"{lid}_S1_N", s1, h_n, zone, lid)
    add_edge(f"{lid}_S1_W", s1, h_w, zone, lid)
    add_edge(f"{lid}_S2_W", s2, h_w, zone, lid)
    add_edge(f"{lid}_S3_E", s3, h_e, zone, lid)
    add_edge(f"{lid}_S3_N", s3, h_n, zone, lid)
    add_edge(f"{lid}_S4_S", s4, h_s, zone, lid)
    add_edge(f"{lid}_S5_W", s5, h_w, zone, lid)

    # Central workshop near shafts
    ws = f"{lid}_WORKSHOP"
    add_node(ws, -60.0, y, 95.0, "workshop", lid, f"{lid} central workshop")
    add_edge(f"{lid}_WS_S1", s1, ws, zone, lid)
    add_edge(f"{lid}_WS_S2", s2, ws, zone, lid)

    # Refuge + services
    ref = f"{lid}_REFUGE"
    add_node(ref, -190.0, y, -95.0, "refuge", lid, f"{lid} refuge chamber")
    add_edge(f"{lid}_REF_W", h_w, ref, zone, lid)
    dam = f"{lid}_DAM"
    add_node(dam, 120.0, y, -170.0, "emergency", lid, f"{lid} dirty-water sump / dam")
    add_edge(f"{lid}_DAM_S", h_s, dam, zone, lid)
    emuls = f"{lid}_EMULSION"
    add_node(emuls, -145.0, y, 170.0, "restricted", lid, f"{lid} emulsion bay · AUTHORIZED ONLY")
    add_edge(f"{lid}_EMUL_N", h_n, emuls, zone, lid)

    # Truck tips toward Shaft 3 (esp. 750 & 850 — two tips each per IDP)
    tips = []
    if lid in ("L750", "L850"):
        for i, (tx, tz) in enumerate([(230.0, 110.0), (250.0, -50.0)]):
            tid = f"{lid}_TIP{i+1}"
            add_node(tid, tx, y, tz, "tip", lid, f"{lid} truck tip → Shaft 3")
            add_edge(f"{lid}_TIP{i+1}_S3", s3, tid, f"{lid}_ROCK", lid)
            add_edge(f"{lid}_TIP{i+1}_E", h_e, tid, f"{lid}_ROCK", lid)
            tips.append(tid)
    elif lid == "L950":
        # Crushing station + conveyor excavation feeding Shaft 3 bin/loading
        crush = f"{lid}_CRUSHER"
        add_node(crush, 230.0, y, 15.0, "crusher", lid, "950 m crushing station")
        conv = f"{lid}_CONVEYOR"
        add_node(conv, 205.0, y, 60.0, "conveyor", lid, "Conveyor to Shaft 3 loading")
        tip = f"{lid}_TIP"
        add_node(tip, 240.0, y, 95.0, "tip", lid, "950 m tip / bin feed")
        add_edge(f"{lid}_S3_CRUSH", s3, crush, f"{lid}_ROCK", lid)
        add_edge(f"{lid}_CRUSH_CONV", crush, conv, f"{lid}_ROCK", lid)
        add_edge(f"{lid}_CONV_TIP", conv, tip, f"{lid}_ROCK", lid)
        add_edge(f"{lid}_TIP_E", tip, h_e, f"{lid}_ROCK", lid)
        tips = [tip]
    else:  # L1050 — future lower tip / conveyor from deeper
        tip = f"{lid}_TIP"
        add_node(tip, 240.0, y, 50.0, "tip", lid, "1 050 m tip (future conveyor)")
        add_edge(f"{lid}_S3_TIP", s3, tip, f"{lid}_ROCK", lid)
        add_edge(f"{lid}_TIP_E", tip, h_e, f"{lid}_ROCK", lid)
        tips = [tip]

    # Production areas (stopes) — well east / north-east of shaft complex
    stopes = []
    if stope_bias == "north":
        stope_pts = [
            (430.0, 190.0, "N1"), (520.0, 95.0, "N2"), (480.0, 290.0, "N3"),
            (380.0, 340.0, "N4"),
        ]
    elif stope_bias == "east":
        stope_pts = [
            (480.0, 50.0, "E1"), (580.0, -25.0, "E2"), (530.0, 145.0, "E3"),
            (430.0, -95.0, "E4"),
        ]
    else:
        stope_pts = [
            (460.0, 120.0, "P1"), (550.0, 215.0, "P2"), (500.0, 25.0, "P3"),
            (410.0, -70.0, "P4"),
        ]

    prev_stope = h_e
    for sx, sz, tag in stope_pts:
        sid = f"{lid}_STOPE_{tag}"
        add_node(sid, sx, y, sz, "work_zone", lid, f"{lid} production · {tag}")
        add_edge(f"{lid}_to_{tag}", prev_stope, sid, f"{lid}_PROD", lid)
        stopes.append(sid)
        prev_stope = sid

    # Satellite workshop near stopes
    sat = f"{lid}_SAT_WS"
    add_node(sat, 360.0, y, 170.0, "workshop", lid, f"{lid} satellite workshop · drills")
    add_edge(f"{lid}_SAT_E", h_e, sat, f"{lid}_PROD", lid)
    if stopes:
        add_edge(f"{lid}_SAT_STOPE", sat, stopes[0], f"{lid}_PROD", lid)

    # Sublevel stub / ore-pass collar toward production (for vertical ore passes)
    op = f"{lid}_OREPASS"
    add_node(op, 380.0, y, 70.0, "ore_pass", lid, f"{lid} ore-pass collar")
    add_edge(f"{lid}_OP_E", h_e, op, f"{lid}_ROCK", lid)

    return {"haul": [h_n, h_e, h_s, h_w], "tips": tips, "stopes": stopes, "orepass": op, "workshop": ws}


level_meta = {}
biases = {"L750": "north", "L850": "east", "L950": "mixed", "L1050": "east"}
for lv in LEVELS:
    level_meta[lv["id"]] = build_level(lv["id"], lv["depth_m"], biases[lv["id"]])


def add_spiral_ramp(
    prefix: str,
    start_id: str,
    end_id: str,
    zone: str,
    *,
    radius_m: float = 95.0,
    turns: float = 1.35,
    segments: int = 12,
    grade_target: float = 0.12,
) -> str:
    """
    Inclined spiral decline between two level stations (real truck-ramp geometry).

    Typical UG truck declines run ~10–15% grade. We target ~12% (1:8.3) so a
    100 m level interval needs ~830 m of roadway — realised as a helix rather
    than a vertical shaft stub.
    """
    import math

    a, b = nodes[start_id], nodes[end_id]
    y0, y1 = a["y"], b["y"]
    dy = y1 - y0
    # Centre the spiral between the two station XY positions
    cx = 0.5 * (a["x"] + b["x"])
    cz = 0.5 * (a["z"] + b["z"])
    # Start angle from centre toward start node
    ang0 = math.atan2(a["z"] - cz, a["x"] - cx)
    # Stretch radius slightly if stations are farther apart
    station_r = max(
        math.hypot(a["x"] - cx, a["z"] - cz),
        math.hypot(b["x"] - cx, b["z"] - cz),
        40.0,
    )
    r = max(radius_m, station_r + 25.0)

    # Ensure grade ≈ grade_target: path_len ≈ |dy| / grade
    path_needed = abs(dy) / grade_target if grade_target > 1e-6 else abs(dy)
    circ = 2.0 * math.pi * r
    turns = max(turns, path_needed / circ)

    ids = [start_id]
    for i in range(1, segments):
        t = i / segments
        ang = ang0 + turns * 2.0 * math.pi * t
        # Blend radius: start near start station, end near end station
        rr = r * (0.85 + 0.15 * math.sin(t * math.pi))
        x = cx + rr * math.cos(ang)
        z = cz + rr * math.sin(ang)
        y = y0 + dy * t
        nid = f"{prefix}_P{i}"
        # Mid-ramp nodes belong to the deeper level once past halfway
        lid = b["level_id"] if t >= 0.5 else a["level_id"]
        add_node(nid, x, y, z, "intersection", lid, f"Ramp · {prefix} · ch {i}")
        ids.append(nid)
    ids.append(end_id)

    for i in range(len(ids) - 1):
        add_edge(f"{prefix}_{i}", ids[i], ids[i + 1], zone, None, "ramp", speed=0.95)
    return f"{prefix}_0"


# Interconnecting spiral ramps (Shaft 1 access + east production logistics)
# Mimics IDP “interconnecting ramps” between 750 / 850 / 950 / 1 050 m haulage levels
ramp_starts = {}
for a, b in [("L750", "L850"), ("L850", "L950"), ("L950", "L1050")]:
    # Access ramp near Shaft 1 — spiral offset west of S1
    s1a, s1b = f"{a}_S1", f"{b}_S1"
    # Insert dedicated ramp portals slightly offset so we don't spiral on the shaft column
    for lid, sid, tag, dx, dz in [
        (a, s1a, "TOP", -70.0, 50.0),
        (b, s1b, "BOT", -70.0, 50.0),
    ]:
        portal = f"RAMP_{a}_{b}_S1_{tag}"
        n = nodes[sid]
        add_node(portal, n["x"] + dx, n["y"], n["z"] + dz, "intersection", lid,
                 f"{lid} Shaft 1 ramp portal")
        add_edge(f"{portal}_LINK", sid, portal, "ACCESS_RAMP", lid, "tunnel")
    ramp_starts[f"RAMP_{a}_{b}_S1"] = add_spiral_ramp(
        f"RAMP_{a}_{b}_S1", f"RAMP_{a}_{b}_S1_TOP", f"RAMP_{a}_{b}_S1_BOT",
        "ACCESS_RAMP", radius_m=130.0, turns=1.25, segments=14, grade_target=0.12,
    )

    # Production / truck ramp on east side — larger radius for 42–54 t trucks
    for lid, hid, tag, dx, dz in [
        (a, f"{a}_HAUL_E", "TOP", 80.0, -30.0),
        (b, f"{b}_HAUL_E", "BOT", 80.0, -30.0),
    ]:
        portal = f"RAMP_{a}_{b}_E_{tag}"
        n = nodes[hid]
        add_node(portal, n["x"] + dx, n["y"], n["z"] + dz, "intersection", lid,
                 f"{lid} east truck-ramp portal")
        add_edge(f"{portal}_LINK", hid, portal, "PROD_RAMP", lid, "tunnel")
    ramp_starts[f"RAMP_{a}_{b}_E"] = add_spiral_ramp(
        f"RAMP_{a}_{b}_E", f"RAMP_{a}_{b}_E_TOP", f"RAMP_{a}_{b}_E_BOT",
        "PROD_RAMP", radius_m=160.0, turns=1.45, segments=16, grade_target=0.12,
    )

# Short drift-and-fill style access inclines from haulage into first stopes (sublevel feel)
for lid in ("L750", "L850", "L950"):
    meta = level_meta[lid]
    if not meta["stopes"]:
        continue
    haul = f"{lid}_HAUL_E"
    stope = meta["stopes"][0]
    ha, hs = nodes[haul], nodes[stope]
    # Mid incline point dropped 8 m toward a "sublevel" access
    mid = f"{lid}_SUBACC"
    add_node(
        mid,
        0.5 * (ha["x"] + hs["x"]),
        ha["y"] - 8.0,
        0.5 * (ha["z"] + hs["z"]),
        "intersection",
        lid,
        f"{lid} sublevel access incline",
    )
    add_edge(f"{lid}_SUB_0", haul, mid, f"{lid}_PROD", lid, "ramp", speed=0.9)
    add_edge(f"{lid}_SUB_1", mid, stope, f"{lid}_PROD", lid, "ramp", speed=0.9)

# Vertical ore passes linking production levels down toward 950 crusher / Shaft 3 system
add_edge("OREPASS_750_850", "L750_OREPASS", "L850_OREPASS", "ORE_PASS", None, "ore_pass")
add_edge("OREPASS_850_950", "L850_OREPASS", "L950_OREPASS", "ORE_PASS", None, "ore_pass")
add_edge("OREPASS_950_1050", "L950_OREPASS", "L1050_OREPASS", "ORE_PASS", None, "ore_pass")

print("spiral ramp start edges:", ramp_starts)

# ---------------------------------------------------------------------------
# Gateways (LoRa) — denser near shafts, haulage, stopes
# ---------------------------------------------------------------------------
gw_i = 1
for lv in LEVELS:
    lid, y = lv["id"], lv["depth_m"]
    meta = level_meta[lid]
    points = [
        (f"{lid}_S1", "Shaft 1 station"),
        (f"{lid}_S3", "Shaft 3 tip station"),
        (f"{lid}_WORKSHOP", "Central workshop"),
        (f"{lid}_HAUL_E", "East haulage"),
        (f"{lid}_HAUL_N", "North haulage"),
        (meta["orepass"], "Ore-pass collar"),
    ] + [(s, f"Stope {s.split('_')[-1]}") for s in meta["stopes"][:3]]
    for nid, label in points:
        n = nodes[nid]
        add_gw(f"GW-{gw_i:02d}", n["x"] + 3, y, n["z"] - 2, f"{lid}_HAULAGE", lid,
               f"Platreef · {lid} · {label}")
        gw_i += 1

add_gw("GW-SURF", 15.0, 0.0, 5.0, "SURFACE", "SURFACE", "Platreef surface · Shaft 1 collar")

# ---------------------------------------------------------------------------
# Fixed environmental sensors
# ---------------------------------------------------------------------------
sid = 1
for lv in LEVELS:
    lid, y = lv["id"], lv["depth_m"]
    for kind, unit, nx, nz, name in [
        ("CH4", "%LEL", 45.0, 45.0, "methane"),
        ("O2", "%", -25.0, 25.0, "oxygen"),
        ("AIRFLOW", "m/s", 15.0, -35.0, "airflow"),
    ]:
        sensors.append({
            "sensor_id": f"ES-{sid:02d}",
            "name": f"Platreef {lid} {name}",
            "sensor_type": kind,
            "x": nx, "y": y, "z": nz,
            "zone_id": f"{lid}_HAULAGE",
            "level_id": lid,
            "unit": unit,
            "linked_gateway_id": f"GW-{(sid - 1) % max(1, len(gateways)) + 1:02d}" if gateways else None,
            "battery_pct": 85 + (sid % 10),
            "maintenance_due_days": 60 + sid * 7,
        })
        sid += 1
# Exactly one unit is due for service (shows as "Degraded" on the Systems page: due ≤ 45 days)
next(s for s in reversed(sensors) if s["sensor_type"] == "AIRFLOW")["maintenance_due_days"] = 21

# ---------------------------------------------------------------------------
# Write configs
# ---------------------------------------------------------------------------
zones = sorted({e["zone_id"] for e in edges})
mine = {
    "name": "Platreef Mine — inspired reconstruction (Mokopane, Limpopo)",
    "description": (
        "Educational / simulation layout inspired by publicly described Platreef "
        "infrastructure (Shafts 1–5, 750/850/950/1050 m haulage levels, Shaft 3 "
        "rock-handling, ramps, ore passes, workshops). Not a proprietary survey."
    ),
    "location": "Near Mokopane, Limpopo Province, South Africa",
    "coordinate_system": {
        "x": "east_m", "y": "elevation_m", "z": "north_m",
        "note": "Y=0 at surface collar; underground levels negative",
    },
    "inspiration": {
        "source": "Ivanhoe Mines Platreef IDP / FS public disclosures",
        "disclaimer": "Inspired reconstruction for demo only — not surveyed mine plans",
    },
    "levels": [{"id": "SURFACE", "name": "Surface", "depth_m": 0.0, "label": "Surface · Mokopane"}] + LEVELS,
    "nodes": list(nodes.values()),
    "edges": edges,
    "zones": zones,
    "portals": [],
    "shafts": [
        {"id": k, **{kk: vv for kk, vv in v.items() if kk != "xz"}, "x": v["xz"][0], "z": v["xz"][1]}
        for k, v in SHAFTS.items()
    ],
}

(root / "mine.json").write_text(json.dumps(mine, indent=2), encoding="utf-8")

gateways_cfg = {
    "coverage_radius_m": 110,
    "path_loss_exponent": 2.9,
    "reference_rssi_at_1m": -40,
    "noise_std_db": 4.0,
    "gateways": gateways,
}
(root / "gateways.json").write_text(json.dumps(gateways_cfg, indent=2), encoding="utf-8")

# Preserve existing sensor schema fields if present in prior file
sensors_out = {"sensors": sensors}
(root / "sensors.json").write_text(json.dumps(sensors_out, indent=2), encoding="utf-8")

print(f"Wrote mine.json nodes={len(nodes)} edges={len(edges)} levels={len(LEVELS)}")
print(f"Wrote gateways.json count={len(gateways)}")
print(f"Wrote sensors.json count={len(sensors)}")
