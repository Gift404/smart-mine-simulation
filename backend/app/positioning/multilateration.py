"""
Estimate (x, y, z) from >=4 gateway RSSI observations using linearized
least-squares multilateration over RSSI-derived 3D distances.

Falls back to planar XZ solve (holding Y at the strongest gateway elevation)
when fewer than 4 observations are available but >= 3 exist.
"""
from __future__ import annotations
import numpy as np

from app.models.gateway import Gateway, RssiObservation


def rssi_to_distance(rssi: float, reference_rssi_at_1m: float, path_loss_exponent: float) -> float:
    return 10 ** ((reference_rssi_at_1m - rssi) / (10 * path_loss_exponent))


def estimate_position(
    observations: list[RssiObservation],
    gateways: dict[str, Gateway],
    reference_rssi_at_1m: float,
    path_loss_exponent: float,
) -> dict | None:
    if len(observations) < 3:
        return None

    obs = sorted(observations, key=lambda o: o.rssi, reverse=True)[:5]
    pts = np.array([
        [gateways[o.gateway_id].x, gateways[o.gateway_id].y, gateways[o.gateway_id].z]
        for o in obs
    ])
    dists = np.array([rssi_to_distance(o.rssi, reference_rssi_at_1m, path_loss_exponent) for o in obs])

    if len(obs) >= 4:
        sol = _lstsq_3d(pts, dists)
    else:
        sol = _lstsq_xz_fixed_y(pts, dists)

    if sol is None:
        return None
    x, y, z = sol
    return {
        "x": float(x),
        "y": float(y),
        "z": float(z),
        "gateways_used": [o.gateway_id for o in obs],
        "n_gateways": len(obs),
        "avg_rssi": float(np.mean([o.rssi for o in obs])),
    }


def _lstsq_3d(pts: np.ndarray, dists: np.ndarray):
    x1, y1, z1 = pts[0]
    r1 = dists[0]
    A, b = [], []
    for (xi, yi, zi), ri in zip(pts[1:], dists[1:]):
        A.append([2 * (xi - x1), 2 * (yi - y1), 2 * (zi - z1)])
        b.append(r1 ** 2 - ri ** 2 - x1 ** 2 + xi ** 2 - y1 ** 2 + yi ** 2 - z1 ** 2 + zi ** 2)
    try:
        solution, *_ = np.linalg.lstsq(np.array(A), np.array(b), rcond=None)
        return float(solution[0]), float(solution[1]), float(solution[2])
    except np.linalg.LinAlgError:
        return None


def _lstsq_xz_fixed_y(pts: np.ndarray, dists: np.ndarray):
    """3 anchors: solve XZ, keep elevation of strongest gateway."""
    y_fixed = float(pts[0, 1])
    x1, z1 = pts[0, 0], pts[0, 2]
    # Adjust ranges for fixed-Y plane
    r_plane = []
    for (xi, yi, zi), ri in zip(pts, dists):
        dy = yi - y_fixed
        r2 = max(ri ** 2 - dy ** 2, 0.25)
        r_plane.append(np.sqrt(r2))
    r1 = r_plane[0]
    A, b = [], []
    for (xi, _yi, zi), ri in zip(pts[1:], r_plane[1:]):
        A.append([2 * (xi - x1), 2 * (zi - z1)])
        b.append(r1 ** 2 - ri ** 2 - x1 ** 2 + xi ** 2 - z1 ** 2 + zi ** 2)
    try:
        solution, *_ = np.linalg.lstsq(np.array(A), np.array(b), rcond=None)
        return float(solution[0]), y_fixed, float(solution[1])
    except np.linalg.LinAlgError:
        return None
