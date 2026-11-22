"""WebSocket API for SmartKnob integration."""
from __future__ import annotations

import logging
import yaml
import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .const import DOMAIN, EVENT_SMARTKNOB_CONFIG

_LOGGER = logging.getLogger(__name__)


@websocket_api.websocket_command({
    vol.Required("type"): "smartknob/get_devices",
})
@websocket_api.async_response
async def ws_get_devices(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Return all configured SmartKnob devices."""
    devices = []
    for entry_id, coordinator in hass.data.get(DOMAIN, {}).items():
        if hasattr(coordinator, "device_name"):
            devices.append({
                "entry_id": entry_id,
                "name": coordinator.device_name,
                "ip": coordinator.device_ip,
                "filename": coordinator.config_filename,
            })
    connection.send_result(msg["id"], {"devices": devices})


@websocket_api.websocket_command({
    vol.Required("type"): "smartknob/get_config",
    vol.Required("entry_id"): str,
})
@websocket_api.async_response
async def ws_get_config(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Get the configuration for a specific device."""
    entry_id = msg["entry_id"]
    coordinator = hass.data.get(DOMAIN, {}).get(entry_id)
    if not coordinator or not hasattr(coordinator, "async_parse_config"):
        connection.send_error(msg["id"], "not_found", "Device coordinator not found")
        return

    config_dict = await coordinator.async_parse_config()
    yaml_text = await coordinator.async_get_config_yaml()
    connection.send_result(msg["id"], {
        "config": config_dict,
        "yaml": yaml_text,
        "filename": coordinator.config_filename,
        "name": coordinator.device_name,
        "ip": coordinator.device_ip,
    })


@websocket_api.websocket_command({
    vol.Required("type"): "smartknob/save_config",
    vol.Required("entry_id"): str,
    vol.Required("config"): dict,
})
@websocket_api.async_response
async def ws_save_config(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Save the configuration for a specific device and push to Knob."""
    entry_id = msg["entry_id"]
    coordinator = hass.data.get(DOMAIN, {}).get(entry_id)
    if not coordinator or not hasattr(coordinator, "config_file_path"):
        connection.send_error(msg["id"], "not_found", "Device coordinator not found")
        return

    new_config = msg["config"]
    full_yaml_dict = {
        "smartknob": {
            "device": {
                "name": coordinator.device_name,
                "ip": coordinator.device_ip,
            },
            "menu": new_config.get("menu", []),
        }
    }
    yaml_text = yaml.dump(full_yaml_dict, allow_unicode=True, sort_keys=False)

    file_path = coordinator.config_file_path

    def _write_file():
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(yaml_text)

    await hass.async_add_executor_job(_write_file)
    pushed = await coordinator.async_push_config()
    connection.send_result(msg["id"], {
        "success": True,
        "pushed": pushed,
        "filename": coordinator.config_filename,
    })


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
    websocket_api.async_register_command(hass, ws_get_devices)
    websocket_api.async_register_command(hass, ws_get_config)
    websocket_api.async_register_command(hass, ws_save_config)
    websocket_api.async_register_command(hass, ws_push_config)
    websocket_api.async_register_command(hass, ws_status)
