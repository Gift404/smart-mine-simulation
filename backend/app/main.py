from __future__ import annotations
import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.logging_config import setup_logging, get_logger
from app.config import MQTT_HOST, MQTT_PORT, INFLUX_URL, INFLUX_TOKEN, INFLUX_ORG, INFLUX_BUCKET, SIM_TICK_HZ
from app.simulator.simulation_engine import SimulationEngine
from app.websocket.manager import WebSocketManager
from app.database.influx import InfluxWriter

setup_logging()
logger = get_logger("MAIN")

ws_manager = WebSocketManager()
influx = InfluxWriter(INFLUX_URL, INFLUX_TOKEN, INFLUX_ORG, INFLUX_BUCKET)
_main_loop: asyncio.AbstractEventLoop | None = None

# Try to use a real MQTT broker; fall back to an in-process bus for local dev
try:
    from app.mqtt.client import MqttBus
    mqtt_bus = MqttBus(host=MQTT_HOST, port=MQTT_PORT)
    _mqtt_available = True
except Exception:
    mqtt_bus = None
    _mqtt_available = False


def publish(topic: str, payload: dict) -> None:
    """Publish to MQTT (if connected) and mirror onto the WebSocket bus + Influx."""
    if _mqtt_available and mqtt_bus is not None:
        try:
            if mqtt_bus._client.is_connected():
                mqtt_bus.publish(topic, payload)
        except Exception:
            pass
    # Skip WS work when nobody is listening — avoids task storms that starve REST
    if ws_manager.active:
        coro = ws_manager.broadcast({"topic": topic, "payload": payload})
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(coro)
        except RuntimeError:
            if _main_loop is not None and _main_loop.is_running():
                asyncio.run_coroutine_threadsafe(coro, _main_loop)
    if "telemetry" in topic:
        influx.write_measurement("telemetry", {"tag_id": payload.get("tag_id", "")}, payload, payload.get("ts", 0))
    elif "position" in topic and payload.get("method") == "RSSI_MULTILATERATION":
        # Skip high-rate IMU/portal frames — only persist radio fixes
        influx.write_measurement("position", {"tag_id": payload.get("tag_id", "")}, payload, payload.get("ts", 0))


engine = SimulationEngine(publish=publish)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _main_loop
    _main_loop = asyncio.get_running_loop()
    if _mqtt_available:
        try:
            mqtt_bus.connect()
            logger.info("MQTT connected host=%s port=%s", MQTT_HOST, MQTT_PORT)
        except Exception as e:
            logger.warning("MQTT broker unavailable (%s); running with WebSocket-only bus", e)
    task = asyncio.create_task(_simulation_loop())
    logger.info("simulation loop started tick_hz=%.1f", SIM_TICK_HZ)
    if os.getenv("AUTO_START", "true").lower() in ("1", "true", "yes"):
        engine.start(seed_demo=False)
        logger.info("simulation auto-started (AUTO_START)")
    yield
    task.cancel()
    logger.info("shutdown")
    _main_loop = None


app = FastAPI(title="Smart-LoRa Mine Safety Simulation", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


async def _simulation_loop():
    dt = 1.0 / SIM_TICK_HZ
    while True:
        # Offload sync tick so HTTP/WebSocket stay responsive under load
        await asyncio.to_thread(engine.tick, dt)
        await asyncio.sleep(dt)


# ---------- REST API ----------

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/workers")
def list_workers():
    return [w.model_dump() for w in engine.worker_sim.workers.values()]


@app.get("/api/workers/{worker_id}")
def get_worker(worker_id: str):
    w = engine.worker_sim.workers.get(worker_id)
    return w.model_dump() if w else {"error": "not found"}


@app.get("/api/mine")
def get_mine():
    return {
        "name": engine.mine.name,
        "coordinate_system": engine.mine.coordinate_system,
        "levels": [lv.__dict__ for lv in engine.mine.levels],
        "nodes": [n.__dict__ for n in engine.mine.nodes.values()],
        "edges": [e.__dict__ for e in engine.mine.edges.values()],
        "zones": engine.list_zones(),
        "portals": [p.__dict__ for p in engine.mine.portals],
    }


@app.get("/api/zones")
def list_zones():
    return engine.list_zones()


@app.get("/api/gateways")
def list_gateways():
    return [g.model_dump() for g in engine.gateway_sim.gateways.values()]


@app.get("/api/sensors")
def list_sensors():
    return [s.model_dump() for s in engine.sensor_sim.sensors.values()]


@app.get("/api/vehicles")
def list_vehicles():
    return [v.model_dump() for v in engine.vehicle_sim.vehicles.values()]


@app.get("/api/alerts")
def list_alerts():
    return [a.model_dump() for a in engine.alert_engine.all_alerts.values()]


@app.get("/api/geofences")
def list_geofences():
    return engine.geofence_engine.list_fences()


@app.post("/api/alerts/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: str):
    alert = engine.alert_engine.acknowledge(alert_id, engine.sim_time_s)
    return alert.model_dump() if alert else {"error": "not found"}


@app.get("/api/jobs")
def list_jobs():
    return [j.model_dump() for j in engine.job_engine.jobs.values()]


@app.get("/api/simulation/status")
def simulation_status():
    return {
        "running": engine.running,
        "sim_time_s": engine.sim_time_s,
        "speed_multiplier": engine.speed_multiplier,
        "workers": len(engine.worker_sim.workers),
        "active_alerts": len(engine.alert_engine.active_alerts),
        "gateways_online": len(engine.gateway_sim.online_gateways()),
        "gateways_total": len(engine.gateway_sim.gateways),
        "sensors_online": engine.sensor_sim.online_count(),
        "sensors_total": len(engine.sensor_sim.sensors),
        "vehicles": len(engine.vehicle_sim.vehicles),
    }


@app.post("/api/simulation/start")
def simulation_start(seed_demo: bool = True):
    engine.start(seed_demo=seed_demo)
    return {"running": True, "demo_seeded": engine._demo_seeded}


@app.post("/api/simulation/pause")
def simulation_pause():
    engine.pause()
    return {"running": False}


@app.post("/api/simulation/reset")
def simulation_reset():
    engine.reset()
    return {"reset": True}


@app.post("/api/simulation/speed/{multiplier}")
def simulation_speed(multiplier: float):
    engine.set_speed(multiplier)
    return {"speed_multiplier": multiplier}


@app.post("/api/simulation/trigger/{scenario}/{worker_id}")
def trigger_scenario(scenario: str, worker_id: str):
    if worker_id not in engine.worker_sim.workers:
        return {"error": "unknown worker"}
    try:
        engine.trigger_scenario(scenario, worker_id)
    except ValueError as e:
        return {"error": str(e)}
    return {"triggered": scenario, "worker_id": worker_id}


@app.post("/api/simulation/zone-gas/{zone_id}")
def trigger_zone_gas(zone_id: str, value: float = 30.0):
    try:
        affected = engine.trigger_zone_gas(zone_id, value)
    except ValueError as e:
        return {"error": str(e)}
    return {"triggered": "zone_gas", "zone_id": zone_id, "value": value, "affected_workers": affected}


@app.post("/api/simulation/backhaul/{gateway_id}")
def set_backhaul(gateway_id: str, failed: bool = True):
    try:
        gw = engine.set_backhaul_failure(gateway_id, failed)
    except ValueError as e:
        return {"error": str(e)}
    return {"gateway_id": gateway_id, "failed": failed, "gateway": gw}


@app.post("/api/simulation/gateway/{gateway_id}/offline")
def set_gateway_offline(gateway_id: str, offline: bool = True):
    try:
        gw = engine.set_gateway_offline(gateway_id, offline)
    except ValueError as e:
        return {"error": str(e)}
    return {"gateway_id": gateway_id, "offline": offline, "gateway": gw}


@app.post("/api/simulation/sensor/{sensor_id}/offline")
def set_sensor_offline(sensor_id: str, offline: bool = True):
    try:
        sensor = engine.set_sensor_offline(sensor_id, offline)
    except ValueError as e:
        return {"error": str(e)}
    return {"sensor_id": sensor_id, "offline": offline, "sensor": sensor}


@app.post("/api/simulation/sensor/{sensor_id}/fault")
def set_sensor_fault(sensor_id: str, fault: bool = True):
    try:
        sensor = engine.set_sensor_fault(sensor_id, fault)
    except ValueError as e:
        return {"error": str(e)}
    return {"sensor_id": sensor_id, "fault": fault, "sensor": sensor}


# ---------- WebSocket ----------

@app.websocket("/ws/live")
async def ws_live(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # keepalive / ignored client pings
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
