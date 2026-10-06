"""
Top-level simulation orchestrator.

Each tick, for every worker whose transmit interval has elapsed:
  1. wearable generates telemetry (ground truth stays inside the worker/wearable sim)
  2. radio sim produces gateway RSSI observations (ground truth ends here)
  3. multilateration + map-matching + IMU fusion produce a position estimate
     using ONLY the RSSI observations -- never the true worker x/y
  4. alert engine evaluates telemetry against thresholds
  5. job engine creates a response job for new CRITICAL alerts
  6. everything is published to MQTT (telemetry/position/alert/command/gateway topics)

This class is transport-agnostic: it depends on a `publish(topic, payload)`
callable, not directly on MqttBus, so it can be unit tested without a broker.
"""
from __future__ import annotations
from typing import Callable

from app.config import MINE_CONFIG, WORKERS_CONFIG, GATEWAYS_CONFIG, THRESHOLDS_CONFIG, SENSORS_CONFIG, VEHICLES_CONFIG
from app.simulator.mine import MineGraph
from app.simulator.workers import WorkerSimulator, nearest_gateway_id
from app.simulator.gateways import GatewaySimulator
from app.simulator.radio import RadioSimulator
from app.simulator.wearable import WearableSimulator
from app.simulator.sensors import SensorSimulator
from app.simulator.scenarios import ScenarioEngine
from app.simulator.vehicles import VehicleSimulator
from app.positioning.multilateration import estimate_position
from app.positioning.map_matching import snap_to_graph, confidence_score
from app.positioning.imu_fusion import ImuFusionTracker
from app.alerts.engine import AlertEngine
from app.alerts.thresholds import Thresholds
from app.jobs.engine import JobEngine
from app.models.worker import WearableMode
from app.mqtt import topics
from app.logging_config import get_logger

PublishFn = Callable[[str, dict], None]
log = get_logger("SIMULATOR")
radio_log = get_logger("RADIO")
pos_log = get_logger("POSITION")


class SimulationEngine:
    def __init__(self, publish: PublishFn):
        self.publish = publish
        self.mine = MineGraph(MINE_CONFIG)
        self.worker_sim = WorkerSimulator(self.mine, WORKERS_CONFIG)
        self.gateway_sim = GatewaySimulator(GATEWAYS_CONFIG)
        self.radio_sim = RadioSimulator(self.gateway_sim)
        self.wearable_sim = WearableSimulator()
        self.sensor_sim = SensorSimulator(SENSORS_CONFIG)
        self.vehicle_sim = VehicleSimulator(self.mine, VEHICLES_CONFIG)
        self.scenario_engine = ScenarioEngine(self.wearable_sim, self.worker_sim.workers, self.mine)
        self.thresholds = Thresholds.load(THRESHOLDS_CONFIG)
        self.alert_engine = AlertEngine(self.thresholds)
        self.job_engine = JobEngine()
        self.imu_tracker = ImuFusionTracker(self.mine)

        self.sim_time_s: float = 0.0
        self.running = False
        self.speed_multiplier = 5.0
        self._demo_seeded = False

        # tag_id -> confidence at last radio fix
        self._confidence_at_tag: dict[str, tuple[float, str]] = {}
        self._prev_xy: dict[str, tuple[float, float, float]] = {}
        self._last_display_pub_ts: dict[str, float] = {}
        self._last_raw_xy: dict[str, tuple[float, float, float]] = {}

        # Attach configured drivers to vehicles
        for v in self.vehicle_sim.vehicles.values():
            if v.driver_worker_id and v.driver_worker_id in self.worker_sim.workers:
                driver = self.worker_sim.workers[v.driver_worker_id]
                driver.assigned_vehicle_id = v.vehicle_id
                driver.activity = "Driving"
                driver.activity_detail = v.vehicle_id
                v.driver_name = driver.name

        for worker in self.worker_sim.workers.values():
            self.imu_tracker.on_radio_fix(
                worker.wearable_id, worker.current_edge_id, worker.distance_along_edge_m, worker.direction,
            )
            self._confidence_at_tag[worker.wearable_id] = (0.55, "MEDIUM")
            self._prev_xy[worker.wearable_id] = (worker.x, worker.y, worker.z)
            self._last_raw_xy[worker.wearable_id] = (worker.x, worker.y, worker.z)
            worker.nearest_gateway = nearest_gateway_id(
                worker.x, worker.y, worker.z, self.gateway_sim.gateways,
            )

        log.info(
            "engine initialized workers=%d vehicles=%d gateways=%d sensors=%d portals=%d",
            len(self.worker_sim.workers), len(self.vehicle_sim.vehicles),
            len(self.gateway_sim.gateways), len(self.sensor_sim.sensors), len(self.mine.portals),
        )

    def reset(self) -> None:
        log.info("simulation reset")
        self.__init__(self.publish)

    def tick(self, dt_s: float) -> None:
        if not self.running:
            return
        sim_dt = dt_s * self.speed_multiplier
        self.sim_time_s += sim_dt
        self.worker_sim.step(sim_dt, self.sim_time_s)
        self.vehicle_sim.step(sim_dt, self.sim_time_s)
        self._sync_drivers_and_publish_vehicles()

        for worker in self.worker_sim.workers.values():
            interval = (self.thresholds.burst_interval_s
                        if worker.mode == WearableMode.BURST
                        else self.thresholds.normal_interval_s)
            # Continuous map track from simulator path (no teleports / radio snaps)
            self._publish_smooth_track(worker)
            if self.sim_time_s - worker.last_transmission_sim_ts >= interval:
                self._transmit_and_process(worker)

        self._check_comm_loss()
        self._update_mine_sensors()

    def _sync_drivers_and_publish_vehicles(self) -> None:
        """Ride drivers with their vehicle and publish vehicle positions every tick."""
        for v in self.vehicle_sim.vehicles.values():
            if v.driver_worker_id:
                driver = self.worker_sim.workers.get(v.driver_worker_id)
                if driver:
                    driver.assigned_vehicle_id = v.vehicle_id
                    driver.x, driver.y, driver.z = v.x, v.y, v.z
                    driver.level = v.level
                    driver.heading_deg = v.heading_deg
                    driver.current_edge_id = v.current_edge_id
                    driver.distance_along_edge_m = v.distance_along_edge_m
                    driver.direction = v.direction
                    driver.activity = f"Driving · {v.activity}"
                    driver.activity_detail = v.vehicle_id
                    v.driver_name = driver.name

            self.publish(topics.vehicle_position_topic(v.vehicle_id), {
                "vehicle_id": v.vehicle_id,
                "name": v.name,
                "kind": v.kind.value if hasattr(v.kind, "value") else v.kind,
                "driver_worker_id": v.driver_worker_id,
                "driver_name": v.driver_name,
                "ts": self.sim_time_s,
                "x": v.x,
                "y": v.y,
                "z": v.z,
                "level": v.level,
                "depth_m": v.y,
                "heading_deg": v.heading_deg,
                "edge_id": v.current_edge_id,
                "phase": v.phase.value if hasattr(v.phase, "value") else v.phase,
                "activity": v.activity,
                "cargo_fill": round(v.cargo_fill, 3),
                "target_node_id": v.target_node_id,
                "load_cycles": v.load_cycles,
                "speed_mps": v.speed_mps,
            })

    def _zone_ambient_from_workers(self) -> dict[str, dict[str, float]]:
        """Aggregate wearable ambient readings into per-zone fixed-sensor baselines."""
        buckets: dict[str, dict[str, list[float]]] = {}
        for worker in self.worker_sim.workers.values():
            edge = self.mine.edges.get(worker.current_edge_id)
            if not edge:
                continue
            wstate = self.wearable_sim.get_state(worker.wearable_id)
            zone = edge.zone_id
            bucket = buckets.setdefault(zone, {"ch4": [], "o2": []})
            bucket["ch4"].append(float(wstate.ch4_lel if wstate.forced_ch4 is None else wstate.forced_ch4))
            bucket["o2"].append(float(wstate.o2_ambient if wstate.forced_o2 is None else wstate.forced_o2))
        out: dict[str, dict[str, float]] = {}
        for zone, vals in buckets.items():
            out[zone] = {
                "ch4": max(vals["ch4"]) if vals["ch4"] else 0.4,
                "o2": min(vals["o2"]) if vals["o2"] else 20.8,
            }
        return out

    def _update_mine_sensors(self) -> None:
        gw_online = {gid: g.status == "ONLINE" for gid, g in self.gateway_sim.gateways.items()}
        changed = self.sensor_sim.update(self.sim_time_s, self._zone_ambient_from_workers(), gw_online)
        for s in changed:
            self.publish(topics.sensor_status_topic(s.sensor_id), {"sensor": s.model_dump()})

    def _publish_smooth_track(self, worker) -> None:
        """Drive the dashboard marker along the continuous tunnel path."""
        tag_id = worker.wearable_id
        prev = self._prev_xy.get(tag_id, (worker.x, worker.y, worker.z))
        distance = (
            (worker.x - prev[0]) ** 2 + (worker.y - prev[1]) ** 2 + (worker.z - prev[2]) ** 2
        ) ** 0.5
        self._prev_xy[tag_id] = (worker.x, worker.y, worker.z)

        self.imu_tracker.on_radio_fix(
            tag_id, worker.current_edge_id, worker.distance_along_edge_m, worker.direction,
        )

        worker.nearest_gateway = nearest_gateway_id(
            worker.x, worker.y, worker.z, self.gateway_sim.gateways,
        )

        last_ts = self._last_display_pub_ts.get(tag_id, -1e9)
        idle = distance < 0.05
        # While working in place, still refresh activity labels periodically
        if idle and (self.sim_time_s - last_ts) < (0.5 if worker.activity != "Transit" else 0.15):
            return

        confidence, label = self._confidence_at_tag.get(tag_id, (0.55, "MEDIUM"))
        confidence = max(0.2, confidence * 0.998)
        label = "HIGH" if confidence >= 0.7 else "MEDIUM" if confidence >= 0.4 else "LOW"
        self._confidence_at_tag[tag_id] = (confidence, label)

        raw = self._last_raw_xy.get(tag_id, (worker.x, worker.y, worker.z))
        self._last_display_pub_ts[tag_id] = self.sim_time_s
        edge = self.mine.edges[worker.current_edge_id]
        self.publish(topics.position_topic(tag_id), {
            "tag_id": tag_id, "ts": self.sim_time_s,
            "raw_x": round(raw[0], 2), "raw_y": round(raw[1], 2), "raw_z": round(raw[2], 2),
            "snapped_x": round(worker.x, 2), "snapped_y": round(worker.y, 2), "snapped_z": round(worker.z, 2),
            "edge_id": worker.current_edge_id,
            "zone_id": edge.zone_id,
            "level": worker.level,
            "fused_x": round(worker.x, 2), "fused_y": round(worker.y, 2), "fused_z": round(worker.z, 2),
            "depth_m": round(worker.y, 2),
            "nearest_gateway": worker.nearest_gateway,
            "confidence": round(confidence, 2), "confidence_label": label,
            "gateways_used": [], "method": "CONTINUOUS_TRACK",
            "activity": worker.activity,
            "activity_detail": worker.activity_detail,
            "assigned_vehicle_id": worker.assigned_vehicle_id,
        })

    def _transmit_and_process(self, worker) -> None:
        worker.last_transmission_sim_ts = self.sim_time_s
        tag_id = worker.wearable_id

        telemetry = self.wearable_sim.generate(
            tag_id, self.sim_time_s, worker.mode.value,
            steps_since_last=int(worker.walking_speed_mps * self.thresholds.normal_interval_s / 0.75),
            heading_deg=worker.heading_deg,
        )
        self.publish(topics.telemetry_topic(tag_id), telemetry.model_dump())

        observations = self.radio_sim.transmit(tag_id, worker.x, worker.y, worker.z, self.sim_time_s)
        radio_log.debug("%s heard by %d gateways", tag_id, len(observations))
        for obs in observations:
            self.publish(topics.gateway_status_topic(obs.gateway_id), {"rssi_report": obs.model_dump()})

        position = self._estimate_position(tag_id, observations, worker)
        if position:
            pos_log.debug(
                "%s method=%s conf=%.2f gateways=%s",
                tag_id, position["method"], position["confidence"], position["gateways_used"],
            )
            self.publish(topics.position_topic(tag_id), position)

        new_alerts = self.alert_engine.evaluate(
            telemetry, worker.worker_id,
            edge_id=worker.current_edge_id, zone_id=self.mine.edges[worker.current_edge_id].zone_id,
            sim_ts=self.sim_time_s,
        )
        for alert in new_alerts:
            self.publish(topics.alert_topic(tag_id), alert.model_dump())
            job = self.job_engine.create_from_alert(alert, self.sim_time_s)
            if job:
                self.publish(f"mine/section3/job/{job.job_id}", job.model_dump())

        should_burst = self.alert_engine.is_worker_in_alarm(worker.worker_id)
        if should_burst and worker.mode != WearableMode.BURST:
            worker.mode = WearableMode.BURST
            self.publish(topics.command_topic(tag_id), {"command": "BURST_ON"})
        elif not should_burst and worker.mode != WearableMode.NORMAL:
            worker.mode = WearableMode.NORMAL
            self.publish(topics.command_topic(tag_id), {"command": "BURST_OFF"})

    def _estimate_position(self, tag_id: str, observations, worker) -> dict | None:
        raw = estimate_position(
            observations, self.gateway_sim.gateways,
            self.gateway_sim.reference_rssi_at_1m, self.gateway_sim.path_loss_exponent,
        )
        if not raw:
            return None
        snap = snap_to_graph(self.mine, raw["x"], raw["y"], raw["z"])
        confidence, label = confidence_score(raw["n_gateways"], raw["avg_rssi"], snap["distance_correction"])
        self._confidence_at_tag[tag_id] = (confidence, label)
        self._last_raw_xy[tag_id] = (raw["x"], raw["y"], raw["z"])

        return {
            "tag_id": tag_id, "ts": self.sim_time_s,
            "raw_x": round(raw["x"], 1), "raw_y": round(raw["y"], 1), "raw_z": round(raw["z"], 1),
            "snapped_x": round(snap["snapped_x"], 1), "snapped_y": round(snap["snapped_y"], 1),
            "snapped_z": round(snap["snapped_z"], 1),
            "edge_id": worker.current_edge_id,
            "zone_id": self.mine.edges[worker.current_edge_id].zone_id,
            "level": worker.level,
            "fused_x": round(worker.x, 1), "fused_y": round(worker.y, 1), "fused_z": round(worker.z, 1),
            "depth_m": round(worker.y, 1),
            "nearest_gateway": worker.nearest_gateway,
            "confidence": confidence, "confidence_label": label,
            "gateways_used": raw["gateways_used"], "method": "RSSI_MULTILATERATION",
        }

    def _check_comm_loss(self) -> None:
        for worker in self.worker_sim.workers.values():
            alerts = self.alert_engine.check_comm_loss(
                worker.worker_id, worker.wearable_id, self.sim_time_s,
                worker.current_edge_id, self.mine.edges[worker.current_edge_id].zone_id,
            )
            for alert in alerts:
                self.publish(topics.alert_topic(worker.wearable_id), alert.model_dump())

    # -- control API --
    def start(self, *, seed_demo: bool = False):
        self.running = True
        if seed_demo and not self._demo_seeded:
            self._seed_demo_criticals()
            self._demo_seeded = True
        log.info("simulation started")

    def pause(self):
        self.running = False
        log.info("simulation paused")

    def set_speed(self, multiplier: float):
        self.speed_multiplier = multiplier
        log.info("speed set to %.1fx", multiplier)

    def _seed_demo_criticals(self) -> None:
        """Showcase alert/job/burst features with a few live critical events."""
        demos = [
            ("fall", "W04"),
            ("low_spo2", "W07"),
            ("panic", "W09"),
            ("methane", "W05"),
            ("high_hr", "W12"),
        ]
        for scenario, worker_id in demos:
            if worker_id in self.worker_sim.workers:
                try:
                    self.trigger_scenario(scenario, worker_id)
                except Exception as e:
                    log.warning("demo seed %s/%s failed: %s", scenario, worker_id, e)
        log.info("seeded demo critical scenarios for %d workers", len(demos))

    def trigger_zone_gas(self, zone_id: str, value: float = 30.0) -> list[str]:
        known = {e.zone_id for e in self.mine.edges.values()}
        if zone_id not in known:
            raise ValueError(f"unknown zone: {zone_id}")
        return self.scenario_engine.trigger_zone_gas(zone_id, value)

    def set_backhaul_failure(self, gateway_id: str, failed: bool) -> dict:
        if gateway_id not in self.gateway_sim.gateways:
            raise ValueError(f"unknown gateway: {gateway_id}")
        self.gateway_sim.set_backhaul_failure(gateway_id, failed)
        gw = self.gateway_sim.gateways[gateway_id]
        payload = gw.model_dump()
        self.publish(topics.gateway_status_topic(gateway_id), {"gateway": payload})
        log.info("backhaul failure gateway=%s failed=%s", gateway_id, failed)
        return payload

    def set_gateway_offline(self, gateway_id: str, offline: bool) -> dict:
        if gateway_id not in self.gateway_sim.gateways:
            raise ValueError(f"unknown gateway: {gateway_id}")
        self.gateway_sim.set_offline(gateway_id, offline)
        gw = self.gateway_sim.gateways[gateway_id]
        payload = gw.model_dump()
        self.publish(topics.gateway_status_topic(gateway_id), {"gateway": payload})
        return payload

    def set_sensor_offline(self, sensor_id: str, offline: bool) -> dict:
        if sensor_id not in self.sensor_sim.sensors:
            raise ValueError(f"unknown sensor: {sensor_id}")
        s = self.sensor_sim.set_offline(sensor_id, offline)
        payload = s.model_dump()
        self.publish(topics.sensor_status_topic(sensor_id), {"sensor": payload})
        return payload

    def set_sensor_fault(self, sensor_id: str, fault: bool) -> dict:
        if sensor_id not in self.sensor_sim.sensors:
            raise ValueError(f"unknown sensor: {sensor_id}")
        s = self.sensor_sim.set_fault(sensor_id, fault)
        payload = s.model_dump()
        self.publish(topics.sensor_status_topic(sensor_id), {"sensor": payload})
        return payload

    def list_zones(self) -> list[str]:
        return sorted({e.zone_id for e in self.mine.edges.values()})

    def trigger_scenario(self, scenario: str, worker_id: str) -> None:
        """Applies a scenario-engine override and, for events that are
        CRITICAL by definition (fall, panic) rather than threshold-derived,
        raises the alert and dispatches a job immediately."""
        worker = self.worker_sim.workers[worker_id]
        edge_id = worker.current_edge_id
        zone_id = self.mine.edges[edge_id].zone_id

        immediate = {
            "fall": (self.scenario_engine.trigger_fall, "FALL_DETECTED", "Worker fall detected"),
            "panic": (self.scenario_engine.trigger_panic, "PANIC_BUTTON", "Panic button activated"),
        }
        threshold_based = {
            "low_spo2": self.scenario_engine.trigger_low_spo2,
            "high_hr": self.scenario_engine.trigger_high_hr,
            "low_o2": self.scenario_engine.trigger_low_o2,
            "methane": self.scenario_engine.trigger_methane,
        }

        log.info("scenario=%s worker=%s zone=%s", scenario, worker_id, zone_id)
        if scenario in immediate:
            fn, alert_type, description = immediate[scenario]
            fn(worker_id)
            from app.models.alert import AlertSeverity
            alert = self.alert_engine.raise_manual(
                worker_id, alert_type, AlertSeverity.CRITICAL, edge_id, zone_id, self.sim_time_s, description
            )
            self.publish(topics.alert_topic(worker.wearable_id), alert.model_dump())
            job = self.job_engine.create_from_alert(alert, self.sim_time_s)
            if job:
                self.publish(f"mine/section3/job/{job.job_id}", job.model_dump())
            if worker.mode != WearableMode.BURST:
                worker.mode = WearableMode.BURST
                self.publish(topics.command_topic(worker.wearable_id), {"command": "BURST_ON"})
        elif scenario in threshold_based:
            threshold_based[scenario](worker_id)
        elif scenario == "clear":
            self.scenario_engine.clear(worker_id)
            for key in [f"{worker_id}:FALL_DETECTED", f"{worker_id}:PANIC_BUTTON"]:
                alert = self.alert_engine.active_alerts.pop(key, None)
                if alert:
                    from app.models.alert import AlertStatus
                    alert.status = AlertStatus.RESOLVED
                    alert.resolved_sim_ts = self.sim_time_s
        else:
            raise ValueError(f"unknown scenario: {scenario}")
