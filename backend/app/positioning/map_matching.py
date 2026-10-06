from app.simulator.mine import MineGraph


def snap_to_graph(mine: MineGraph, x: float, y: float, z: float = 0.0) -> dict:
    return mine.snap_point(x, y, z)


def confidence_score(n_gateways: int, avg_rssi: float, distance_correction: float) -> tuple[float, str]:
    gw_score = min(1.0, n_gateways / 5.0)
    rssi_score = max(0.0, min(1.0, (avg_rssi + 110) / 60))
    correction_penalty = max(0.0, 1.0 - distance_correction / 40.0)

    score = round(0.4 * gw_score + 0.3 * rssi_score + 0.3 * correction_penalty, 2)
    label = "HIGH" if score >= 0.7 else "MEDIUM" if score >= 0.4 else "LOW"
    return score, label
