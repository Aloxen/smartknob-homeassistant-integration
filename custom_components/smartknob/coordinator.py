"""Coordinator and push logic for SmartKnob."""
from __future__ import annotations

import logging
import yaml
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .const import (
    DOMAIN,
    CONF_CONFIG_YAML,
    CONF_DEVICE_IP,
    CONF_DEVICE_NAME,
    DEFAULT_CONFIG_YAML,
    EVENT_SMARTKNOB_CONFIG,
)

_LOGGER = logging.getLogger(__name__)


class SmartKnobCoordinator(DataUpdateCoordinator):
    """Class to manage SmartKnob configuration and event dispatching."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        """Initialize."""
        super().__init__(
            hass,
            _LOGGER,
            name=f"SmartKnob ({entry.data.get(CONF_DEVICE_NAME, 'Knob')})",
        )
        self.entry = entry

    @property
    def device_name(self) -> str:
        """Return the device name."""
        return self.entry.data.get(CONF_DEVICE_NAME, "SmartKnob")

    @property
    def device_ip(self) -> str:
        """Return the device IP."""
        return self.entry.data.get(CONF_DEVICE_IP, "")

    @property
    def config_yaml(self) -> str:
        """Return the current YAML config (from smartknob.yaml or entry options)."""
        file_path = self.hass.config.path("smartknob.yaml")
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
                if content.strip():
                    return content
        except Exception:
            pass

        # If file does not exist, write default template
        fallback = self.entry.options.get(
            CONF_CONFIG_YAML,
            self.entry.data.get(CONF_CONFIG_YAML, DEFAULT_CONFIG_YAML),
        )
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(fallback)
        except Exception as ex:
            _LOGGER.debug("Could not write initial smartknob.yaml: %s", ex)

        return fallback

    def parse_config(self) -> dict:
        """Parse current YAML config into dict format expected by ESP32."""
        raw = yaml.safe_load(self.config_yaml) or {}
        if "smartknob" in raw:
            raw = raw["smartknob"]
        return raw

    async def async_push_config(self) -> bool:
        """Push the configuration to SmartKnob over the HA event bus."""
        try:
            config_dict = self.parse_config()
            event_data = {
                "device_id": self.entry.entry_id,
                "device_name": self.device_name,
                "config": config_dict,
            }
            self.hass.bus.async_fire(EVENT_SMARTKNOB_CONFIG, event_data)
            _LOGGER.info(
                "Pushed SmartKnob config for %s to event bus: %s",
                self.device_name,
                EVENT_SMARTKNOB_CONFIG,
            )
            return True
        except Exception as ex:
            _LOGGER.error("Failed to parse and push SmartKnob config: %s", ex)
            return False
