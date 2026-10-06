SECTION = "mine/section3"


def telemetry_topic(tag_id: str) -> str:
    return f"{SECTION}/wearable/{tag_id}/telemetry"


def position_topic(tag_id: str) -> str:
    return f"{SECTION}/wearable/{tag_id}/position"


def alert_topic(tag_id: str) -> str:
    return f"{SECTION}/wearable/{tag_id}/alert"


def command_topic(tag_id: str) -> str:
    return f"{SECTION}/wearable/{tag_id}/command"


def gateway_status_topic(gateway_id: str) -> str:
    return f"{SECTION}/gateway/{gateway_id}/status"


def sensor_status_topic(sensor_id: str) -> str:
    return f"{SECTION}/sensor/{sensor_id}/status"


def vehicle_position_topic(vehicle_id: str) -> str:
    return f"{SECTION}/vehicle/{vehicle_id}/position"


TELEMETRY_WILDCARD = f"{SECTION}/wearable/+/telemetry"
COMMAND_WILDCARD = f"{SECTION}/wearable/+/command"
GATEWAY_WILDCARD = f"{SECTION}/gateway/+/status"
SENSOR_WILDCARD = f"{SECTION}/sensor/+/status"
VEHICLE_WILDCARD = f"{SECTION}/vehicle/+/position"
