"""
Geofencing: detect unauthorized entry into restricted mine areas.

On entry → raise RESTRICTED_ZONE alert + signal watch vibration.
On exit  → auto-resolve the alert and stop vibration.
"""
from __future__ import annotations
import json
from dataclasses import dataclass, field
from pathlib import Path

from app.models.alert import Alert, AlertSeverity
from app.models.worker import Worker
from app.alerts.engine import AlertEngine
from app.simulator.mine import MineGraph
from app.logging_config import get_logger

log = get_logger("GEOFENCE")

ALERT_TYPE = "RESTRICTED_ZONE"


@dataclass
class GeofenceRule:
    fence_id: str
    name: str
    node_ids: list[str] = field(default_factory=list)
    zone_ids: list[str] = field(default_factory=list)
    radius_m: float = 35.0
    severity: AlertSeverity = AlertSeverity.WARNING
    allowed_roles: list[str] = field(default_factory=list)
    message: str = "Restricted area"


@dataclass
class GeofenceEvent:
    """Result of one worker check this tick."""
    worker_id: str
    tag_id: str
    fence_id: str
    fence_name: str
    entered: bool = False
    exited: bool = False
    still_inside: bool = False
    alert: Alert | None = None
    vibrate_on: bool = False
    vibrate_off: bool = False
    severity: AlertSeverity = AlertSeverity.WARNING
    description: str = ""
    zone_id: str | None = None
    edge_id: str | None = None


class GeofenceEngine:
    def __init__(self, config_path: Path, mine: MineGraph, alert_engine: AlertEngine):
        self.alert_engine = alert_engine
        self.mine = mine
        self.rules: list[GeofenceRule] = []
        # worker_id -> set of fence_ids currently occupied (unauthorized)
        self._inside: dict[str, set[str]] = {}
        self._load(config_path)

    def _load(self, path: Path) -> None:
        if not path.exists():
            log.warning("geofences config missing: %s", path)
            return
        data = json.loads(path.read_text(encoding="utf-8"))
        default_r = float(data.get("default_radius_m", 35))
        for raw in data.get("fences", []):
            sev = AlertSeverity(raw.get("severity", "WARNING"))
            self.rules.append(GeofenceRule(
                fence_id=raw["fence_id"],
                name=raw.get("name", raw["fence_id"]),
                node_ids=list(raw.get("node_ids") or []),
                zone_ids=list(raw.get("zone_ids") or []),
                radius_m=float(raw.get("radius_m", default_r)),
                severity=sev,
                allowed_roles=list(raw.get("allowed_roles") or []),
                message=raw.get("message", "Restricted area"),
            ))
        log.info("loaded %d geofence rules from %s", len(self.rules), path.name)

    def list_fences(self) -> list[dict]:
        out = []
        for r in self.rules:
            nodes = []
            for nid in r.node_ids:
                n = self.mine.nodes.get(nid)
                if n:
                    nodes.append({
                        "id": n.id, "x": n.x, "y": n.y, "z": n.z,
                        "level_id": n.level_id, "type": n.type, "name": getattr(n, "name", None),
                    })
            out.append({
                "fence_id": r.fence_id,
                "name": r.name,
                "node_ids": r.node_ids,
                "zone_ids": r.zone_ids,
                "radius_m": r.radius_m,
                "severity": r.severity.value,
                "allowed_roles": r.allowed_roles,
                "message": r.message,
                "nodes": nodes,
            })
        return out

    def is_inside(self, worker: Worker, rule: GeofenceRule) -> bool:
        """True if unauthorized worker is inside this fence."""
        if worker.role in rule.allowed_roles:
            return False

        edge = self.mine.edges.get(worker.current_edge_id)
        if edge and edge.zone_id in rule.zone_ids:
            return True

        wx, wy, wz = worker.x, worker.y, worker.z
        for nid in rule.node_ids:
            n = self.mine.nodes.get(nid)
            if not n:
                continue
            dx = wx - n.x
            dy = wy - n.y
            dz = wz - (n.z if n.z is not None else 0.0)
            if (dx * dx + dy * dy + dz * dz) ** 0.5 <= rule.radius_m:
                return True
        return False

    def check_worker(self, worker: Worker, sim_ts: float) -> list[GeofenceEvent]:
        events: list[GeofenceEvent] = []
        prev = self._inside.setdefault(worker.worker_id, set())
        now: set[str] = set()
        edge = self.mine.edges.get(worker.current_edge_id)
        zone_id = edge.zone_id if edge else None

        for rule in self.rules:
            inside = self.is_inside(worker, rule)
            if not inside:
                continue
            now.add(rule.fence_id)
            was = rule.fence_id in prev
            desc = f"{rule.message} · {rule.name}"
            alert_key_type = f"{ALERT_TYPE}:{rule.fence_id}"

            if not was:
                alert = self.alert_engine.raise_manual(
                    worker.worker_id,
                    alert_key_type,
                    rule.severity,
                    worker.current_edge_id,
                    zone_id or rule.fence_id,
                    sim_ts,
                    desc,
                )
                events.append(GeofenceEvent(
                    worker_id=worker.worker_id,
                    tag_id=worker.wearable_id,
                    fence_id=rule.fence_id,
                    fence_name=rule.name,
                    entered=True,
                    alert=alert,
                    vibrate_on=True,
                    severity=rule.severity,
                    description=desc,
                    zone_id=zone_id,
                    edge_id=worker.current_edge_id,
                ))
                log.warning(
                    "GEOFENCE ENTER worker=%s role=%s fence=%s sev=%s",
                    worker.worker_id, worker.role, rule.fence_id, rule.severity.value,
                )
            else:
                events.append(GeofenceEvent(
                    worker_id=worker.worker_id,
                    tag_id=worker.wearable_id,
                    fence_id=rule.fence_id,
                    fence_name=rule.name,
                    still_inside=True,
                    severity=rule.severity,
                    description=desc,
                    zone_id=zone_id,
                    edge_id=worker.current_edge_id,
                ))

        exited = prev - now
        for fence_id in exited:
            rule = next((r for r in self.rules if r.fence_id == fence_id), None)
            alert_key_type = f"{ALERT_TYPE}:{fence_id}"
            self.alert_engine.resolve(worker.worker_id, alert_key_type, sim_ts)
            events.append(GeofenceEvent(
                worker_id=worker.worker_id,
                tag_id=worker.wearable_id,
                fence_id=fence_id,
                fence_name=rule.name if rule else fence_id,
                exited=True,
                vibrate_off=True,
                description=f"Left restricted area · {rule.name if rule else fence_id}",
                zone_id=zone_id,
                edge_id=worker.current_edge_id,
            ))
            log.info("GEOFENCE EXIT worker=%s fence=%s", worker.worker_id, fence_id)

        self._inside[worker.worker_id] = now
        return events

    def worker_should_vibrate(self, worker_id: str) -> bool:
        return bool(self._inside.get(worker_id))
