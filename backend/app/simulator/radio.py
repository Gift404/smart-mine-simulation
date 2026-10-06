"""
Simplified LoRa radio simulation (3D path loss).

    RSSI(d) = RSSI_ref_1m - 10 * n * log10(d) + noise

Distance d is the full 3D Euclidean distance between wearable and gateway
(includes vertical separation between levels).
"""
from __future__ import annotations
import math
import random

from app.simulator.gateways import GatewaySimulator
from app.models.gateway import RssiObservation


class RadioSimulator:
    def __init__(self, gateway_sim: GatewaySimulator, rng: random.Random | None = None):
        self.gw_sim = gateway_sim
        self.rng = rng or random.Random(7)

    def transmit(
        self,
        tag_id: str,
        true_x: float,
        true_y: float,
        true_z: float,
        sim_ts: float,
    ) -> list[RssiObservation]:
        observations = []
        for gw in self.gw_sim.online_gateways():
            distance = math.sqrt(
                (true_x - gw.x) ** 2 + (true_y - gw.y) ** 2 + (true_z - gw.z) ** 2
            )
            distance = max(distance, 0.5)

            rssi = (
                self.gw_sim.reference_rssi_at_1m
                - 10 * self.gw_sim.path_loss_exponent * math.log10(distance)
                + self.rng.gauss(0, self.gw_sim.noise_std_db)
            )

            effective_radius = self.gw_sim.coverage_radius_m * self.rng.uniform(0.9, 1.1)
            if distance <= effective_radius:
                observations.append(
                    RssiObservation(tag_id=tag_id, gateway_id=gw.gateway_id, rssi=round(rssi, 1), ts=sim_ts)
                )
        return observations
