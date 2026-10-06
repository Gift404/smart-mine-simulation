# Chapter 06 — Config and World Model

## 6.1 Philosophy

**Config is the mine.** Code interprets JSON; generators create JSON. Changing layout should not require editing Python/TS business logic.

Loader: `backend/app/config.py` resolves `CONFIG_DIR` to repo `config/` (or `/app/config` in Docker).

## 6.2 `mine.json`

Top-level fields (conceptual):

| Field | Meaning |
|-------|---------|
| `name`, `blueprint` | Metadata |
| `coordinate_system` | Documents X/Y/Z meaning |
| `levels[]` | SURFACE, L1…L4 with `depth_m` |
| `nodes[]` | Graph vertices: id, x,y,z, type, level_id |
| `edges[]` | Segments: start, end, length, zone_id, kind |
| `zones` | Derived zone id list |
| `gateway_locations` | Mirror of gateway poses (also in gateways.json) |
| `portals` | Optional special links |

### Node types (examples)

`surface`, `lift_station`, `intersection`, `refuge`, `workshop`, `emergency`, `work_zone`, `vent_station`, `escape_station`

### Edge kinds

`tunnel` (horizontal drives), `shaft` / `vent_shaft` / `escape_shaft`, `ramp`

Workers move only along edges. Facility rooms in the 3D UI are rendered at facility node types.

## 6.3 `workers.json`

Each worker:

```json
{
  "worker_id": "W04",
  "name": "Naledi",
  "role": "Mechanic",
  "wearable_id": "WD-W04",
  "start_edge": "L2_spine_0",
  "walking_speed_mps": 1.15,
  "behavior_profile": "steady"
}
```

Profiles drive motion AI: `steady`, `patrol`, `shaft_rider`, etc.

## 6.4 `gateways.json`

Radio physics + list:

```json
{
  "coverage_radius_m": 95,
  "path_loss_exponent": 2.8,
  "reference_rssi_at_1m": -40,
  "noise_std_db": 4.0,
  "gateways": [ { "gateway_id", "name", "x", "y", "z", "zone_id", "level_id", "depth_m" } ]
}
```

Dense mesh (~85 units) is produced by `generate_3d_mine.py` (`place_gateway_mesh`).

## 6.5 `sensors.json`

Fixed environmental sensors: CH₄, O₂, AIRFLOW (and optionally TEMP). Each has pose, unit, `linked_gateway_id`, battery/maintenance fields for Systems page.

## 6.6 `thresholds.json`

Defines warn/crit cutovers for vitals and gases, `comm_loss_timeout_s`, and burst/normal transmit intervals. **Tune safety behaviour here**, not in scattered constants.

## 6.7 Generator: `generate_3d_mine.py`

Responsibilities:

1. Build shaft columns (main/vent/escape) through levels.  
2. Build unique horizontal footprints per level (blueprint-inspired).  
3. Add decline ramp L2↔L3.  
4. Place workers on named edges.  
5. Place dense gateway mesh + sensors linked to nearest GW.  
6. Write JSON files.

Rebuild rule: run generator → restart API → hard-refresh UI.

## 6.8 Consistency rules when editing by hand

1. Every `start_edge` / `end` node id must exist.  
2. Edge `length` should match Euclidean distance of endpoints.  
3. Gateway `level_id` should match elevation.  
4. Sensor `linked_gateway_id` must exist in gateways.json.  
5. Zone ids referenced by alerts/UI should appear on edges.

## 6.9 Exercises

1. Find LIFT node on L3; list connected edge ids.  
2. Change one gateway coordinate by 10 m; predict map marker shift.  
3. Add a fictional gateway to JSON; restart; confirm Systems list count +1.

## 6.10 Checkpoint

You can seed and mutate the world safely. Next: **backend rebuild deep dive**.
