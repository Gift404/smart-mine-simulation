"""
Thin async wrapper around paho-mqtt.

This is the ONLY place that talks to the broker. Every other service
(positioning, alerts, jobs, websocket bridge, and later a real ChirpStack
adapter) subscribes/publishes through this class, never through sockets
of its own. That is what lets us swap the simulated telemetry source for
real LoRaWAN hardware later without touching downstream services.
"""
from __future__ import annotations
import asyncio
import json
from typing import Awaitable, Callable

import paho.mqtt.client as mqtt

from app.logging_config import get_logger

logger = get_logger("MQTT")

MessageHandler = Callable[[str, dict], Awaitable[None]]


class MqttBus:
    def __init__(self, host: str = "localhost", port: int = 1883):
        self.host = host
        self.port = port
        self._client = mqtt.Client(protocol=mqtt.MQTTv311)
        self._handlers: list[tuple[str, MessageHandler]] = []
        self._loop: asyncio.AbstractEventLoop | None = None

        self._client.on_message = self._on_message
        self._client.on_connect = self._on_connect

    def connect(self) -> None:
        """Non-blocking connect — loop_start retries in the background."""
        self._loop = asyncio.get_event_loop()
        self._client.connect_async(self.host, self.port, keepalive=30)
        self._client.loop_start()
        logger.info("MQTT connecting host=%s port=%s (async)", self.host, self.port)

    def disconnect(self) -> None:
        self._client.loop_stop()
        self._client.disconnect()

    def _on_connect(self, client, userdata, flags, rc):
        logger.info("Connected to MQTT broker rc=%s", rc)
        for topic, _ in self._handlers:
            client.subscribe(topic)

    def _on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
        except json.JSONDecodeError:
            logger.warning("Non-JSON payload on %s", msg.topic)
            return
        for sub_topic, handler in self._handlers:
            if mqtt.topic_matches_sub(sub_topic, msg.topic):
                assert self._loop is not None
                asyncio.run_coroutine_threadsafe(handler(msg.topic, payload), self._loop)

    def subscribe(self, topic: str, handler: MessageHandler) -> None:
        self._handlers.append((topic, handler))
        self._client.subscribe(topic)

    def publish(self, topic: str, payload: dict) -> None:
        self._client.publish(topic, json.dumps(payload), qos=0)
