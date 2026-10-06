import os
from pathlib import Path

# backend/ locally; /app inside the Docker image
BACKEND_DIR = Path(__file__).resolve().parent.parent
# Monorepo layout: <repo>/config  — Docker layout: /app/config (volume mount)
_REPO_CONFIG = BACKEND_DIR.parent / "config"
_DOCKER_CONFIG = BACKEND_DIR / "config"
CONFIG_DIR = _REPO_CONFIG if _REPO_CONFIG.exists() else _DOCKER_CONFIG

MINE_CONFIG = CONFIG_DIR / "mine.json"
WORKERS_CONFIG = CONFIG_DIR / "workers.json"
GATEWAYS_CONFIG = CONFIG_DIR / "gateways.json"
SENSORS_CONFIG = CONFIG_DIR / "sensors.json"
GEOFENCES_CONFIG = CONFIG_DIR / "geofences.json"
THRESHOLDS_CONFIG = CONFIG_DIR / "thresholds.json"
VEHICLES_CONFIG = CONFIG_DIR / "vehicles.json"

MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))

INFLUX_URL = os.getenv("INFLUX_URL", "http://localhost:8086")
INFLUX_TOKEN = os.getenv("INFLUX_TOKEN", "devtoken")
INFLUX_ORG = os.getenv("INFLUX_ORG", "mine")
INFLUX_BUCKET = os.getenv("INFLUX_BUCKET", "mine_telemetry")

SIM_TICK_HZ = float(os.getenv("SIM_TICK_HZ", "5"))  # simulation steps per real second at 1x speed
