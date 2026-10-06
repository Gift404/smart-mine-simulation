"""Generate fixed environmental sensors from gateway placements."""
import json
from pathlib import Path

root = Path(__file__).resolve().parent
gws = json.loads((root / "gateways.json").read_text(encoding="utf-8"))["gateways"]

by_zone: dict[str, list] = {}
for g in gws:
    by_zone.setdefault(g["zone_id"], []).append(g)

sensors = []
sid = 1

for zone, lst in sorted(by_zone.items()):
    mid = lst[len(lst) // 2]
    sensors.append({
        "sensor_id": f"ES-{sid:02d}",
        "name": f"Methane · {zone}",
        "sensor_type": "CH4",
        "x": mid["x"],
        "y": mid["y"],
        "zone_id": zone,
        "unit": "%LEL",
        "linked_gateway_id": mid["gateway_id"],
        "battery_pct": 88 + (sid % 10),
        "maintenance_due_days": 30 + sid * 3,
    })
    sid += 1
    sensors.append({
        "sensor_id": f"ES-{sid:02d}",
        "name": f"Oxygen · {zone}",
        "sensor_type": "O2",
        "x": mid["x"] + 8,
        "y": mid["y"] + 6,
        "zone_id": zone,
        "unit": "%",
        "linked_gateway_id": mid["gateway_id"],
        "battery_pct": 76 + (sid % 12),
        "maintenance_due_days": 45 + sid * 2,
    })
    sid += 1

for zone, lst in sorted(by_zone.items()):
    for g in (lst[0], lst[-1]):
        sensors.append({
            "sensor_id": f"ES-{sid:02d}",
            "name": f"Airflow · {g['gateway_id']}",
            "sensor_type": "AIRFLOW",
            "x": g["x"],
            "y": g["y"] - 10,
            "zone_id": zone,
            "unit": "m/s",
            "linked_gateway_id": g["gateway_id"],
            "battery_pct": 92,
            "maintenance_due_days": 60 + sid,
        })
        sid += 1

for g in [gws[0], gws[7], gws[14], gws[21]]:
    sensors.append({
        "sensor_id": f"ES-{sid:02d}",
        "name": f"Temp · {g['gateway_id']}",
        "sensor_type": "TEMP",
        "x": g["x"] - 6,
        "y": g["y"] + 8,
        "zone_id": g["zone_id"],
        "unit": "C",
        "linked_gateway_id": g["gateway_id"],
        "battery_pct": 95,
        "maintenance_due_days": 120,
    })
    sid += 1

(root / "sensors.json").write_text(json.dumps({"sensors": sensors}, indent=2) + "\n", encoding="utf-8")
print("sensors", len(sensors))
