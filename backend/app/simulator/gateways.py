from __future__ import annotations
import json
from pathlib import Path

from app.models.gateway import Gateway, BackhaulStatus
from app.logging_config import get_logger

log = get_logger("RADIO")


class GatewaySimulator:
    def __init__(self, config_path: str | Path):
        cfg = json.loads(Path(config_path).read_text())
        self.coverage_radius_m = cfg["coverage_radius_m"]
        self.path_loss_exponent = cfg["path_loss_exponent"]
        self.reference_rssi_at_1m = cfg["reference_rssi_at_1m"]
        self.noise_std_db = cfg["noise_std_db"]
        self.gateways: dict[str, Gateway] = {
            g["gateway_id"]: Gateway(**g) for g in cfg["gateways"]
        }

    def set_backhaul_failure(self, gateway_id: str, failed: bool) -> None:
        gw = self.gateways[gateway_id]
        gw.backhaul_primary = BackhaulStatus.OFFLINE if failed else BackhaulStatus.ONLINE
        gw.backhaul_fallback = BackhaulStatus.ONLINE if failed else BackhaulStatus.ONLINE
        gw.status = "ONLINE"  # fallback keeps it reachable
        log.info("backhaul %s primary=%s fallback=%s", gateway_id, gw.backhaul_primary, gw.backhaul_fallback)

    def set_offline(self, gateway_id: str, offline: bool) -> None:
        self.gateways[gateway_id].status = "OFFLINE" if offline else "ONLINE"
        log.info("gateway %s status=%s", gateway_id, self.gateways[gateway_id].status)

    def online_gateways(self):
        return [g for g in self.gateways.values() if g.status == "ONLINE"]
