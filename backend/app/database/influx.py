"""
InfluxDB writer.

Isolated behind a small interface so the rest of the system never touches
the influxdb_client SDK directly. If InfluxDB is unreachable (e.g. running
this backend standalone without docker-compose), writes are dropped
immediately — never blocking the simulation tick or REST handlers.
"""
from __future__ import annotations

from app.logging_config import get_logger

logger = get_logger("INFLUX")

try:
    from influxdb_client import InfluxDBClient, Point
    from influxdb_client.client.write_api import SYNCHRONOUS
    _HAS_INFLUX = True
except ImportError:
    _HAS_INFLUX = False


class InfluxWriter:
    def __init__(self, url: str, token: str, org: str, bucket: str):
        self.bucket = bucket
        self.org = org
        self.enabled = False
        self._warned = False
        if not _HAS_INFLUX:
            logger.warning("influxdb-client not installed; historical storage disabled")
            return
        try:
            # Short timeout so a missing Influx never stalls the app
            self.client = InfluxDBClient(url=url, token=token, org=org, timeout=500)
            # Probe once; if Influx isn't up, stay disabled (no per-tick hangs)
            ready = self.client.ping()
            if not ready:
                logger.warning("InfluxDB ping failed at %s; historical storage disabled", url)
                try:
                    self.client.close()
                except Exception:
                    pass
                return
            self.write_api = self.client.write_api(write_options=SYNCHRONOUS)
            self.enabled = True
            logger.info("InfluxDB connected url=%s bucket=%s", url, bucket)
        except Exception as e:  # pragma: no cover - depends on external service
            logger.warning("InfluxDB unavailable (%s); historical storage disabled", e)
            self.enabled = False

    def write_measurement(self, measurement: str, tags: dict, fields: dict, ts: float) -> None:
        if not self.enabled:
            return
        try:
            point = Point(measurement)
            for k, v in tags.items():
                point = point.tag(k, str(v))
            for k, v in fields.items():
                # Influx field types must be consistent; skip nested / None
                if v is None or isinstance(v, (dict, list)):
                    continue
                point = point.field(k, v)
            point = point.time(int(ts * 1e9))
            self.write_api.write(bucket=self.bucket, org=self.org, record=point)
        except Exception as e:  # pragma: no cover
            self.enabled = False
            if not self._warned:
                logger.warning("Influx write failed (%s); disabling further writes", e)
                self._warned = True
