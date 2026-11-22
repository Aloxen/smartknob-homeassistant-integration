"""Support for SmartKnob integration."""
from __future__ import annotations

import logging
import os
import yaml
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv
from homeassistant.components import frontend
import voluptuous as vol

from .const import (
    DOMAIN,
    CONF_CONFIG_YAML,
    EVENT_SMARTKNOB_CONFIG,
    SERVICE_PUSH_CONFIG,
)
from .coordinator import SmartKnobCoordinator
from .websocket_api import async_register_websocket_commands

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[Platform] = [Platform.BUTTON]


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the SmartKnob component."""
    hass.data.setdefault(DOMAIN, {})
    async_register_websocket_commands(hass)

    # Register static path for frontend panel
    frontend_dir = os.path.join(os.path.dirname(__file__), "frontend")
    hass.http.register_static_path(
        "/smartknob_panel",
        frontend_dir,
        cache_headers=False,
    )

    # Register SmartKnob Studio sidebar panel
    frontend.async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title="SmartKnob",
        sidebar_icon="mdi:knob",
        frontend_url_path="smartknob",
        config={
            "_panel_custom": {
                "name": "smartknob-panel",
                "module_url": "/smartknob_panel/smartknob-panel.js?v=1.1.0",
            }
        },
        require_admin=False,
    )

    async def handle_push_config_service(call: ServiceCall) -> None:
        """Handle manual push_config service call."""
        entry_id = call.data.get("entry_id")
        config_override = call.data.get("config")

        if config_override:
            hass.bus.async_fire(EVENT_SMARTKNOB_CONFIG, {"config": config_override})
            _LOGGER.info("Pushed custom config to SmartKnob via event bus")
            return

        for entry_id_key, coordinator in hass.data.get(DOMAIN, {}).items():
            if isinstance(coordinator, SmartKnobCoordinator):
                if entry_id is None or entry_id == entry_id_key:
                    await coordinator.async_push_config()

    hass.services.async_register(
        DOMAIN,
        SERVICE_PUSH_CONFIG,
        handle_push_config_service,
        schema=vol.Schema({
            vol.Optional("entry_id"): cv.string,
            vol.Optional("config"): dict,
        }),
    )

    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up SmartKnob from a config entry."""
    coordinator = SmartKnobCoordinator(hass, entry)
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # Listen for entry updates
    entry.async_on_unload(entry.add_update_listener(async_reload_entry))

    # Push config on startup/setup
    hass.async_create_task(coordinator.async_push_config())

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    if unload_ok := await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        hass.data[DOMAIN].pop(entry.entry_id, None)

    return unload_ok


async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload config entry."""
    await async_unload_entry(hass, entry)
    await async_setup_entry(hass, entry)
