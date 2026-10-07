import os
from dataclasses import dataclass
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


@dataclass(frozen=True)
class SimulationConfig:
    """One selectable simulation: a directory of config files.

    Any file missing from `directory` falls back to the primary config in CONFIG_DIR,
    so a layout-only simulation can share thresholds, roster, etc.
    """
    id: str
    name: str
    description: str
    directory: Path

    def path(self, filename: str) -> Path:
        candidate = self.directory / filename
        return candidate if candidate.exists() else CONFIG_DIR / filename

    @property
    def mine(self) -> Path: return self.path("mine.json")
    @property
    def workers(self) -> Path: return self.path("workers.json")
    @property
    def gateways(self) -> Path: return self.path("gateways.json")
    @property
    def sensors(self) -> Path: return self.path("sensors.json")
    @property
    def geofences(self) -> Path: return self.path("geofences.json")
    @property
    def thresholds(self) -> Path: return self.path("thresholds.json")
    @property
    def vehicles(self) -> Path: return self.path("vehicles.json")


# Files for the retired inspired-reconstruction layout remain on disk for tests.
INSPIRED_RECONSTRUCTION = SimulationConfig(
    id="platreef",
    name="Platreef · Inspired reconstruction",
    description="Shafts 1–5, 750–1 050 m haulage rings, spiral truck ramps, tips and stopes.",
    directory=CONFIG_DIR,
)

SCHEMATIC_MODEL = SimulationConfig(
    id="platreef_schematic",
    name="Platreef · Schematic model",
    description="Shafts 1–3, 750/850/950/996 m drives, ore passes, vent raises, silos/crusher and stope blocks.",
    directory=CONFIG_DIR / "simulations" / "platreef_schematic",
)

# Public runtime: schematic only (3D / section / 2D). Inspired reconstruction is not selectable.
SIMULATIONS: dict[str, SimulationConfig] = {SCHEMATIC_MODEL.id: SCHEMATIC_MODEL}

_requested = os.getenv("SIMULATION_ID", SCHEMATIC_MODEL.id)
DEFAULT_SIMULATION_ID = _requested if _requested in SIMULATIONS else SCHEMATIC_MODEL.id

MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))

INFLUX_URL = os.getenv("INFLUX_URL", "http://localhost:8086")
INFLUX_TOKEN = os.getenv("INFLUX_TOKEN", "devtoken")
INFLUX_ORG = os.getenv("INFLUX_ORG", "mine")
INFLUX_BUCKET = os.getenv("INFLUX_BUCKET", "mine_telemetry")

SIM_TICK_HZ = float(os.getenv("SIM_TICK_HZ", "5"))  # simulation steps per real second at 1x speed
