"""WebSocket API for SmartKnob integration."""
from __future__ import annotations

import logging
import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .const import EVENT_SMARTKNOB_CONFIG

_LOGGER = logging.getLogger(__name__)


@websocket_api.websocket_command({
    vol.Required("type"): "smartknob/push_config",
    vol.Optional("device_id"): str,
    vol.Required("config"): dict,
})
@websocket_api.async_response
async def ws_push_config(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Handle smartknob/push_config websocket command."""
    device_id = msg.get("device_id")
    config = msg["config"]

    event_data = {
        "device_id": device_id,
        "config": config,
    }

    hass.bus.async_fire(EVENT_SMARTKNOB_CONFIG, event_data)
    _LOGGER.info("WebSocket command smartknob/push_config fired event")
    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command({
    vol.Required("type"): "smartknob/status",
    vol.Optional("device_id"): str,
    vol.Optional("screen"): str,
    vol.Optional("wifi_rssi"): int,
})
@websocket_api.async_response
async def ws_status(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Handle smartknob/status heartbeat message."""
    connection.send_result(msg["id"], {"status": "ok"})


def async_register_websocket_commands(hass: HomeAssistant) -> None:
    """Register SmartKnob WebSocket API commands."""
    websocket_api.async_register_command(hass, ws_push_config)
    websocket_api.async_register_command(hass, ws_status)
